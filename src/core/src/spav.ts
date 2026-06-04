import {
	isScrollContainer,
	canScroll,
	isFocusableElement,
	isCaretAtEdge,
	intersects,
	getVisibleRect,
	isInDirection,
	getEdgeDistance,
	getWeightedDistance
} from './utils';

import type {
	FocusableElement,
	Origin,
	SpavDirection,
	SpavScrollOptions,
	SpavScrollCallback,
	SpavScrollIntoViewCallback,
	SpavFocusCallback,
	SpavFocusEvent,
	SpavOptions
} from './types';

export class Spav {
	#scrollContainers: Map<Element, boolean>;
	#rects: Map<Element, DOMRect>;
	#origin?: Origin;
	#currentScrollContainer?: Element;

	focusVisible?: boolean;
	scroll?: boolean | SpavScrollOptions | SpavScrollCallback;
	scrollIntoView?: boolean | ScrollIntoViewOptions | SpavScrollIntoViewCallback;
	onFocus?: SpavFocusCallback;

	constructor({ focusVisible, scroll, scrollIntoView, onFocus }: SpavOptions = {}) {
		this.#scrollContainers = new Map();
		this.#rects = new Map();

		this.focusVisible = focusVisible;
		this.scroll = scroll;
		this.scrollIntoView = scrollIntoView;
		this.onFocus = onFocus;

		window.addEventListener('keydown', this.#onKeyDown);
		window.addEventListener('focusout', this.#onFocusOut);
		document.addEventListener('mouseup', this.#onMouseUp);
	}

	#onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Tab') {
			const target = this.#getTabbable(!e.shiftKey);

			if (target) {
				e.preventDefault();
				this.#focus({ target, origin: this.#getFocused() });
			}

			return;
		}

		if (e.key === 'Escape') {
			const focused = this.#getFocused();
			if (focused && isFocusableElement(focused)) focused.blur();
			return;
		}

		let direction: SpavDirection | undefined;

		switch (e.key) {
			case 'ArrowLeft':
				direction = 'left';
				break;
			case 'ArrowRight':
				direction = 'right';
				break;
			case 'ArrowUp':
				direction = 'up';
				break;
			case 'ArrowDown':
				direction = 'down';
				break;
		}

		if (direction) {
			if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;

			const active = document.activeElement;
			if (active && !isCaretAtEdge(active, direction)) return;

			e.preventDefault();
			this.navigate(direction);
		}
	};

	#onFocusOut = (e: FocusEvent) => {
		if (e.relatedTarget || !(e.target instanceof Element)) return;
		// Remembering the element marks this origin as "was focused", so tab steps past it.
		this.#origin = { element: e.target, rect: e.target.getBoundingClientRect() };
	};

	#onMouseUp = (e: MouseEvent) => {
		// A click is a bare position (no element): arrow nav resumes from the point and
		// tab lands on the focusable nearest to it.
		this.#origin = { rect: new DOMRect(e.clientX, e.clientY) };
		this.#currentScrollContainer = undefined;
	};

	/**
	 * Creates a tree walker over the focusable elements in the document, in DOM order.
	 *
	 * @returns A tree walker that accepts only focusable elements.
	 */
	#createFocusableWalker() {
		return document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, (node) =>
			node instanceof Element && this.#isFocusable(node)
				? NodeFilter.FILTER_ACCEPT
				: NodeFilter.FILTER_SKIP
		);
	}

	/**
	 * Finds the focusable element nearest to a point.
	 *
	 * @param x - The horizontal coordinate.
	 * @param y - The vertical coordinate.
	 * @returns The nearest focusable element, or `undefined` if none exist.
	 */
	#getNearestFocusable(x: number, y: number) {
		const walker = this.#createFocusableWalker();

		let nearest: Element | undefined;
		let nearestDistance = Infinity;

		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const rect = (node as Element).getBoundingClientRect();

			// Distance from the point to the rect (0 when the point is inside it).
			const dx = Math.max(rect.left - x, 0, x - rect.right);
			const dy = Math.max(rect.top - y, 0, y - rect.bottom);
			const distance = dx * dx + dy * dy;

			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearest = node as Element;
				if (distance === 0) break; // Point is inside this element — can't beat it.
			}
		}

		return nearest;
	}

	#isScrollContainer(element: Element) {
		let value = this.#scrollContainers.get(element);

		if (value === undefined) {
			value = isScrollContainer(element);
			this.#scrollContainers.set(element, value);
		}

		return value;
	}

	/**
	 * Finds the closest ancestral scroll container of an element.
	 *
	 * @param element - The element to start searching from.
	 * @returns The closest scroll container element, or the document element if none is found.
	 */
	#getScrollContainer(element: Element) {
		for (
			let current = element.parentElement;
			current && current !== document.documentElement;
			current = current.parentElement
		) {
			if (this.#isScrollContainer(current)) return current;
		}

		return document.documentElement;
	}

	/**
	 * Determines if an element is a spatial navigation container.
	 *
	 * @param element - The element to check.
	 * @returns `true` if the element is a spatial navigation container, `false` otherwise.
	 */
	#isContainer(element: Element) {
		return (
			element === document.documentElement ||
			element.hasAttribute('data-spav-contain') ||
			this.#isScrollContainer(element)
		);
	}

	/**
	 * Finds the closest ancestral spatial navigation container of an element.
	 *
	 * @param element - The element to start searching from.
	 * @returns The closest spatial navigation container element, or the document element if none is found.
	 */
	#getContainer(element: Element) {
		for (let current = element.parentElement; current; current = current.parentElement) {
			if (this.#isContainer(current)) return current;
		}

		return document.documentElement;
	}

	#getRect(element: Element) {
		let rect = this.#rects.get(element);

		if (!rect) {
			// The document element's box spans the whole document; treat it as the
			// viewport, which is the spatial-navigation root.
			rect =
				element === document.documentElement
					? new DOMRect(0, 0, element.clientWidth, element.clientHeight)
					: element.getBoundingClientRect();
			this.#rects.set(element, rect);
		}

		return rect;
	}

	/**
	 * Determines if an element can actively receive focus.
	 *
	 * @param element - The element to check.
	 * @returns `true` if the element is focusable, `false` otherwise.
	 */
	#isFocusable(element: Element): element is FocusableElement {
		if (
			element === document.documentElement ||
			element === document.body ||
			!element.isConnected ||
			!isFocusableElement(element) ||
			element.hasAttribute('data-spav-ignore')
		) {
			return false;
		}

		if (element.tabIndex < 0 && !(element instanceof HTMLElement && element.isContentEditable)) {
			return false;
		}

		switch (element.tagName) {
			case 'A':
			case 'AREA':
				if (!element.hasAttribute('href')) return false;
				break;

			case 'AUDIO':
			case 'VIDEO':
				if (!element.hasAttribute('controls')) return false;
				break;
		}

		if (element.matches(':disabled') || element.closest('[inert]')) {
			return false;
		}

		if (
			!element.checkVisibility({
				contentVisibilityAuto: true,
				visibilityProperty: true,
				opacityProperty: true
			})
		) {
			return false;
		}

		const { width, height } = this.#getRect(element);
		if (width <= 0 || height <= 0) return false;

		return true;
	}

	/**
	 * Checks if an element intersects the given bounds and is not fully occluded by other elements.
	 *
	 * @param element - The element to check.
	 * @param bounds - The rectangle to test against.
	 * @returns `true` if the element is visible, `false` otherwise.
	 */
	#isVisible(element: Element, bounds: DOMRect) {
		let visible = getVisibleRect(this.#getRect(element), bounds);
		if (!visible) return false;

		for (
			let container = this.#getScrollContainer(element);
			container !== document.documentElement;
			container = this.#getScrollContainer(container)
		) {
			visible = getVisibleRect(visible, this.#getRect(container));
			if (!visible) return false;
		}

		const centerX = visible.left + visible.width / 2;
		const centerY = visible.top + visible.height / 2;

		const insetLeft = Math.min(centerX, visible.left + 1);
		const insetRight = Math.max(centerX, visible.right - 1);
		const insetTop = Math.min(centerY, visible.top + 1);
		const insetBottom = Math.max(centerY, visible.bottom - 1);

		const testPoints = [
			{ x: centerX, y: centerY },
			{ x: insetLeft, y: insetTop },
			{ x: insetRight, y: insetTop },
			{ x: insetLeft, y: insetBottom },
			{ x: insetRight, y: insetBottom }
		];

		for (const { x, y } of testPoints) {
			const topElement = document.elementFromPoint(x, y);
			if (element.contains(topElement)) return true;
		}

		return false;
	}

	/**
	 * Returns the element that currently holds focus, or `undefined` when focus rests on
	 * the document body (i.e. nothing is actively focused).
	 *
	 * @returns The focused element, or `undefined`.
	 */
	#getFocused() {
		const active = document.activeElement;
		return active && active !== document.body ? active : undefined;
	}

	/**
	 * Resolves the element sequential (tab) navigation should focus next.
	 *
	 * @param next - `true` to move forward, `false` for backward (shift+tab).
	 * @returns The element to focus, or `null` if there is none.
	 */
	#getTabbable(next: boolean) {
		const focused = this.#getFocused();
		const originEl = this.#origin?.element;

		// A click origin has no element, only a point — nothing there was ever focused,
		// so land on the focusable nearest to it rather than stepping past.
		if (!focused && !originEl && this.#origin) {
			const nearest = this.#getNearestFocusable(this.#origin.rect.x, this.#origin.rect.y);
			if (nearest) return nearest;
		}

		// Otherwise step to the adjacent focusable — from the focused element, the
		// previously focused one, or the document start.
		const walker = this.#createFocusableWalker();
		walker.currentNode = focused ?? (originEl?.isConnected ? originEl : document.body);

		return (next ? walker.nextNode() : walker.previousNode()) as Element | null;
	}

	/**
	 * Determines the current spatial navigation origin point.
	 *
	 * @param origin - An origin to fall back to when nothing is focused.
	 * @returns The origin element (if identified) and its bounding rectangle.
	 */
	#getOrigin(origin?: Origin): Origin {
		const focused = this.#getFocused();

		if (focused) {
			if (this.#isContainer(focused) && origin) {
				return { rect: origin.rect };
			}

			return {
				element: focused,
				rect: this.#getRect(focused)
			};
		}

		if (origin) {
			if (origin.element?.isConnected) {
				return {
					element: origin.element,
					rect: this.#getRect(origin.element)
				};
			}

			return { rect: origin.rect };
		}

		return {
			element: document.documentElement,
			rect: this.#getRect(document.documentElement)
		};
	}

	/**
	 * Recursively retrieves all potential focus candidates within a container.
	 *
	 * @param container - The root element to search within.
	 * @returns An array of candidate elements that are either nested containers or focusable targets.
	 */
	#getCandidates = (container: Element) => {
		const candidates: Element[] = [];

		for (const child of container.children) {
			if (this.#isContainer(child)) {
				candidates.push(child);
			} else {
				if (this.#isFocusable(child)) candidates.push(child);
				candidates.push(...this.#getCandidates(child));
			}
		}

		return candidates;
	};

	/**
	 * Evaluates a list of candidate elements and selects the most optimal target for spatial navigation.
	 *
	 * @param origin - An object containing the origin element (if identified) and its bounding rectangle.
	 * @param candidates - An array of potential target elements.
	 * @param direction - The intended direction of navigation.
	 * @returns The best candidate element to navigate to, or `undefined` if none are suitable.
	 */
	#selectBestCandidate(origin: Origin, candidates: Element[], direction: SpavDirection) {
		let bestInternal: Element | undefined;
		let bestInternalDistance = Infinity;

		let bestExternal: Element | undefined;
		let bestExternalDistance = Infinity;

		let bestWrap: Element | undefined;
		let bestWrapDistance = Infinity;

		for (const candidate of candidates) {
			if (candidate === origin.element || candidate.contains(origin.element ?? null)) {
				continue;
			}

			const candidateRect = this.#getRect(candidate);

			if (origin.element?.contains(candidate)) {
				const distance = getEdgeDistance(origin.rect, candidateRect, direction);
				if (distance < bestInternalDistance) {
					bestInternalDistance = distance;
					bestInternal = candidate;
				}
				continue;
			}

			if (isInDirection(origin.rect, candidateRect, direction)) {
				const distance = getWeightedDistance(origin.rect, candidateRect, direction);
				if (distance < bestExternalDistance) {
					bestExternalDistance = distance;
					bestExternal = candidate;
				}
				continue;
			}

			const wrapsOrigin =
				this.#isContainer(candidate) &&
				!this.#isFocusable(candidate) &&
				candidateRect.left <= origin.rect.left &&
				candidateRect.right >= origin.rect.right &&
				candidateRect.top <= origin.rect.top &&
				candidateRect.bottom >= origin.rect.bottom &&
				(!origin.element || !candidate.contains(origin.element));

			if (wrapsOrigin) {
				const distance = getWeightedDistance(origin.rect, candidateRect, direction);
				if (distance < bestWrapDistance) {
					bestWrapDistance = distance;
					bestWrap = candidate;
				}
			}
		}

		return bestInternal ?? bestExternal ?? bestWrap;
	}

	#selectBestVisible(
		origin: Origin,
		candidates: Element[],
		direction: SpavDirection,
		bounds: DOMRect
	) {
		const pool = [...candidates];

		while (pool.length) {
			const best = this.#selectBestCandidate(origin, pool, direction);

			if (!best) return undefined;
			if (this.#isVisible(best, bounds)) return best;

			pool.splice(pool.indexOf(best), 1);
		}

		return undefined;
	}

	#scroll(container: Element, direction: SpavDirection) {
		if (this.scroll === false) return;

		if (typeof this.scroll === 'function') {
			this.scroll({ container, direction });
			return;
		}

		let amount = 40;
		let behavior: ScrollOptions['behavior'];

		if (typeof this.scroll === 'object') {
			if (this.scroll.amount !== undefined) amount = Math.abs(this.scroll.amount);
			behavior = this.scroll.behavior;
		}

		const offsets = {
			left: { left: -amount },
			right: { left: amount },
			up: { top: -amount },
			down: { top: amount }
		};

		container.scrollBy({ ...offsets[direction], behavior });
	}

	#scrollIntoView(target: Element) {
		if (this.scrollIntoView === false) return;

		if (typeof this.scrollIntoView === 'function') {
			this.scrollIntoView({ target, container: this.#getScrollContainer(target) });
			return;
		}

		const options = typeof this.scrollIntoView === 'object' ? this.scrollIntoView : {};

		target.scrollIntoView({
			behavior: 'auto',
			block: 'nearest',
			inline: 'nearest',
			...options
		});
	}

	#focus({ target, origin, direction }: SpavFocusEvent) {
		if (!this.#isFocusable(target)) return false;

		target.focus({ focusVisible: this.focusVisible, preventScroll: true });
		this.#scrollIntoView(target);
		this.#origin = undefined;
		this.#currentScrollContainer = undefined;
		this.onFocus?.({ target, origin, direction });

		return true;
	}

	/**
	 * Attempts to focus a target element.
	 *
	 * @param target - The target element to focus.
	 * @returns `true` if the target element was successfully focused, `false` otherwise.
	 */
	focus(target: Element) {
		return this.#focus({ target });
	}

	/**
	 * Performs spatial navigation in the specified direction.
	 * Finds the best element to focus, or scrolls the nearest container if no element is immediately reachable.
	 *
	 * @param direction - The direction to navigate.
	 */
	navigate(direction: SpavDirection) {
		this.#rects.clear();
		this.#scrollContainers.clear();

		if (this.#currentScrollContainer && !this.#currentScrollContainer.isConnected) {
			this.#currentScrollContainer = undefined;
		}

		const origin = this.#currentScrollContainer
			? {
					element: this.#currentScrollContainer,
					rect: this.#getRect(this.#currentScrollContainer)
				}
			: this.#getOrigin(this.#origin);

		const originEl = origin.element ?? document.elementFromPoint(origin.rect.x, origin.rect.y);
		let container: Element | undefined;

		if (originEl) {
			container = this.#isContainer(originEl) ? originEl : this.#getContainer(originEl);
		} else {
			container = document.documentElement;
		}

		const viewport = this.#getRect(document.documentElement);

		while (container) {
			const candidates = this.#getCandidates(container);
			const visibleCandidates = candidates.filter(
				(candidate) =>
					candidate !== origin.element && intersects(this.#getRect(candidate), viewport)
			);

			if (visibleCandidates.length) {
				let best = this.#selectBestVisible(origin, visibleCandidates, direction, viewport);

				while (best && !this.#isFocusable(best) && this.#isContainer(best)) {
					const innerCandidates = this.#getCandidates(best);
					const visibleInner = innerCandidates.filter(
						(candidate) =>
							candidate !== origin.element && intersects(this.#getRect(candidate), viewport)
					);

					const next = this.#selectBestVisible(origin, visibleInner, direction, viewport);

					// Scroll container entered with no visible targets inside
					if (!next && this.#isScrollContainer(best)) {
						const active = document.activeElement;

						// Blur active element if outside scroll container
						if (active && active !== document.body && !best.contains(active)) {
							if (isFocusableElement(active)) active.blur();
							this.#origin = undefined;
						}

						this.#currentScrollContainer = best;
						this.#scrollIntoView(best);
						return;
					}

					best = next;
				}

				// Skip candidate clipped at the trailing edge while scrolling
				if (best && this.#currentScrollContainer) {
					const bestRect = this.#getRect(best);
					const containerRect = this.#getRect(this.#currentScrollContainer);

					const scrollsBackward =
						(direction === 'down' && bestRect.top < containerRect.top) ||
						(direction === 'up' && bestRect.bottom > containerRect.bottom) ||
						(direction === 'left' && bestRect.right > containerRect.right) ||
						(direction === 'right' && bestRect.left < containerRect.left);

					if (scrollsBackward) best = undefined;
				}

				if (
					best &&
					this.#focus({
						target: best,
						origin: origin.element,
						direction
					})
				) {
					return;
				}
			}

			if (this.scroll !== false) {
				const isContainerScroll = this.#isScrollContainer(container);
				const scrollContainer = isContainerScroll ? container : this.#getScrollContainer(container);

				const hasUnreachedCandidates = candidates.some(
					(candidate) =>
						candidate !== origin.element &&
						isInDirection(origin.rect, this.#getRect(candidate), direction)
				);

				if (
					(hasUnreachedCandidates || isContainerScroll) &&
					canScroll(scrollContainer, direction)
				) {
					this.#scroll(scrollContainer, direction);

					const active = document.activeElement;
					if (active) this.#rects.delete(active); // Active element rect stale after scroll

					// Blur active element if scrolled out of view
					if (
						active &&
						active !== document.body &&
						isFocusableElement(active) &&
						!this.#isVisible(active, viewport)
					) {
						active.blur();
						this.#origin = undefined;
						this.#currentScrollContainer = scrollContainer;
					}

					return;
				}
			}

			const parent = this.#getContainer(container);
			container = parent === container ? undefined : parent;
		}
	}

	/**
	 * Cleans up the instance and removes all event listeners.
	 */
	destroy() {
		this.#rects.clear();
		this.#scrollContainers.clear();
		this.#origin = undefined;
		this.#currentScrollContainer = undefined;

		window.removeEventListener('keydown', this.#onKeyDown);
		window.removeEventListener('focusout', this.#onFocusOut);
		document.removeEventListener('mouseup', this.#onMouseUp);
	}
}
