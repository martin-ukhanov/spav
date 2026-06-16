import { SpavIndicator } from './indicator';

import {
	getExplicitTabIndex,
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
	SpavScrollIntoViewOptions,
	SpavScrollIntoViewCallback,
	SpavFocusCallback,
	SpavFocusEvent,
	SpavIndicatorOptions,
	SpavIndicatorApi,
	SpavOptions
} from './types';

const DEFAULT_SCROLL_AMOUNT = 50;
const DEFAULT_SCROLL_BEHAVIOR: ScrollBehavior = 'auto';
const DEFAULT_SCROLL_INLINE: ScrollLogicalPosition = 'nearest';
const DEFAULT_SCROLL_BLOCK: ScrollLogicalPosition = 'nearest';

const INDICATOR_API_WRITABLE: Record<keyof SpavIndicatorApi, boolean> = {
	speed: true,
	padding: true,
	matchBorderRadius: true,
	autoRaf: true,
	raf: false
};

export class Spav {
	#rects: Map<Element, DOMRect>;
	#focusables: Map<Element, boolean>;
	#scrollContainers: Map<Element, boolean>;

	#origin?: Origin;
	#activeScrollContainer?: Element;
	#observer: IntersectionObserver;

	#indicator?: SpavIndicator;
	#indicatorApi?: SpavIndicatorApi;

	blurOnEscape: boolean;
	scroll: boolean | SpavScrollOptions | SpavScrollCallback;
	scrollIntoView: boolean | SpavScrollIntoViewOptions | SpavScrollIntoViewCallback;
	onFocus?: SpavFocusCallback;

	get indicator(): SpavIndicatorApi | undefined {
		return this.#indicatorApi;
	}

	set indicator(value: boolean | SpavIndicatorOptions) {
		this.#indicator?.destroy();

		if (!value) {
			this.#indicator = undefined;
			this.#indicatorApi = undefined;
			return;
		}

		const indicator = new SpavIndicator(value === true ? undefined : value);
		this.#indicator = indicator;

		const indicatorApi = {} as SpavIndicatorApi;

		for (const key of Object.keys(INDICATOR_API_WRITABLE) as (keyof SpavIndicatorApi)[]) {
			Object.defineProperty(indicatorApi, key, {
				enumerable: true,
				get: () => indicator[key],
				set: INDICATOR_API_WRITABLE[key] ? (value) => Reflect.set(indicator, key, value) : undefined
			});
		}

		this.#indicatorApi = indicatorApi;
	}

	constructor({
		indicator = true,
		blurOnEscape = true,
		scroll = true,
		scrollIntoView = true,
		onFocus
	}: SpavOptions = {}) {
		this.#rects = new Map();
		this.#focusables = new Map();
		this.#scrollContainers = new Map();

		this.#observer = new IntersectionObserver(this.#onIntersect);

		this.indicator = indicator;
		this.blurOnEscape = blurOnEscape;
		this.scroll = scroll;
		this.scrollIntoView = scrollIntoView;
		this.onFocus = onFocus;

		window.addEventListener('keydown', this.#onKeyDown);
		window.addEventListener('focusin', this.#onFocusIn);
		window.addEventListener('focusout', this.#onFocusOut);
		document.addEventListener('pointerup', this.#onPointerUp);
	}

	#onKeyDown = (event: KeyboardEvent) => {
		if (event.defaultPrevented || event.isComposing) return;

		if (event.key === 'Escape') {
			if (this.blurOnEscape) {
				const focused = this.#getFocused();
				if (focused && isFocusableElement(focused)) focused.blur();
			}

			return;
		}

		let direction: SpavDirection | undefined;

		switch (event.key) {
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
			if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;

			const active = document.activeElement;
			if (active && !isCaretAtEdge(active, direction)) return;

			event.preventDefault();
			this.navigate(direction);
		}
	};

	#onFocusIn = ({ target }: FocusEvent) => {
		if (!(target instanceof Element) || target === document.body) return;
		this.#observer.disconnect();
		this.#observer.observe(target);
	};

	#onFocusOut = ({ target, relatedTarget }: FocusEvent) => {
		if (relatedTarget || !(target instanceof Element)) return;
		this.#origin = { element: target, rect: target.getBoundingClientRect() };
		this.#observer.disconnect();
	};

	#onPointerUp = ({ clientX, clientY }: PointerEvent) => {
		this.#origin = { rect: new DOMRect(clientX, clientY) };
		this.#activeScrollContainer = undefined;
	};

	#onIntersect: IntersectionObserverCallback = (entries) => {
		for (const { isIntersecting, target } of entries) {
			if (isIntersecting || target !== this.#getFocused() || !isFocusableElement(target)) {
				continue;
			}

			target.blur();
			this.#origin = undefined;
			this.#activeScrollContainer = this.#getScrollContainer(target);
		}
	};

	/**
	 * Determines if an element is a scroll container and caches the result.
	 *
	 * @param element - The element to check.
	 * @returns `true` if the element is a scroll container, `false` otherwise.
	 */
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
	 * @returns The closest scroll container, up to and including the document root.
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
	 * Determines if an element acts as a spatial navigation container (i.e., the document
	 * root, a scroll container, or explicitly marked via `data-spav-contain`).
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
	 * @param element - The element to check.
	 * @returns The closest spatial navigation container, up to and including the document root.
	 */
	#getContainer(element: Element) {
		for (let current = element.parentElement; current; current = current.parentElement) {
			if (this.#isContainer(current)) return current;
		}

		return document.documentElement;
	}

	/**
	 * Retrieves the bounding rectangle for an element and caches the result.
	 * The document root specifically returns a rect based on its client dimensions.
	 *
	 * @param element - The element to measure.
	 * @returns The computed bounding rectangle.
	 */
	#getRect(element: Element) {
		let rect = this.#rects.get(element);

		if (!rect) {
			if (element === document.documentElement) {
				rect = new DOMRect(0, 0, element.clientWidth, element.clientHeight);
			} else {
				rect = element.getBoundingClientRect();
			}

			this.#rects.set(element, rect);
		}

		return rect;
	}

	/**
	 * Computes the clipping rectangle of an element in viewport coordinates.
	 * This represents the visible client area (excluding borders and scrollbars) where overflow content is clipped.
	 *
	 * @param element - The element to measure.
	 * @returns The computed clipping rectangle.
	 */
	#getClipRect(element: Element) {
		const rect = this.#getRect(element);

		return new DOMRect(
			rect.left + element.clientLeft,
			rect.top + element.clientTop,
			element.clientWidth,
			element.clientHeight
		);
	}

	/**
	 * Determines if an element can currently receive focus.
	 *
	 * @param element - The element to check.
	 * @returns `true` if the element is focusable, `false` otherwise.
	 */
	#checkFocusable(element: Element) {
		if (
			!element.isConnected ||
			element === document.documentElement ||
			element === document.body ||
			!isFocusableElement(element)
		) {
			return false;
		}

		if (
			element instanceof HTMLElement &&
			element.isContentEditable &&
			element.contentEditable !== 'inherit'
		) {
			const tabIndex = getExplicitTabIndex(element);
			if (tabIndex && tabIndex < 0) return false;
		} else if (element.tabIndex < 0) {
			return false;
		}

		switch (element.tagName) {
			case 'a':
			case 'A':
				if (!element.hasAttribute('href')) return false;
				break;

			case 'AUDIO':
			case 'VIDEO':
				if (!element.hasAttribute('controls') && getExplicitTabIndex(element) === undefined) {
					return false;
				}
				break;
		}

		if (element.matches(':disabled') || element.closest('[inert], [data-spav-ignore]')) {
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
	 * Determines if an element can currently receive focus and caches the result.
	 *
	 * @param element - The element to check.
	 * @returns `true` if the element is focusable, `false` otherwise.
	 */
	#isFocusable(element: Element): element is FocusableElement {
		let value = this.#focusables.get(element);

		if (value === undefined) {
			value = this.#checkFocusable(element);
			this.#focusables.set(element, value);
		}

		return value;
	}

	/**
	 * Determines if an element intersects the given bounds and is not fully occluded by other elements.
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
			visible = getVisibleRect(visible, this.#getClipRect(container));
			if (!visible) return false;
		}

		const center = {
			x: visible.left + visible.width / 2,
			y: visible.top + visible.height / 2
		};

		const left = Math.min(center.x, visible.left + 1);
		const right = Math.max(center.x, visible.right - 1);
		const top = Math.min(center.y, visible.top + 1);
		const bottom = Math.max(center.y, visible.bottom - 1);

		const points: { x: number; y: number }[] = [
			{ x: center.x, y: center.y }, // Center
			{ x: left, y: center.y }, // Left center
			{ x: right, y: center.y }, // Right center
			{ x: center.x, y: top }, // Top center
			{ x: center.x, y: bottom }, // Bottom center
			{ x: left, y: top }, // Top left
			{ x: right, y: top }, // Top right
			{ x: left, y: bottom }, // Bottom left
			{ x: right, y: bottom } // Bottom right
		];

		for (const { x, y } of points) {
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
	 * Determines the current spatial navigation origin.
	 *
	 * @param origin - An origin to fall back to when nothing is actively focused.
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
	 * @param container - The root container element to search within.
	 * @param candidates - The array that accumulates results across recursive calls.
	 * @returns An array of candidate elements that are either focusable targets or nested containers.
	 */
	#getCandidates(container: Element, candidates: Element[] = []) {
		for (const child of container.children) {
			if (this.#isContainer(child)) {
				candidates.push(child);
			} else {
				if (this.#isFocusable(child)) candidates.push(child);
				this.#getCandidates(child, candidates);
			}
		}

		return candidates;
	}

	/**
	 * Evaluates a list of candidate elements and selects the most optimal target for spatial navigation.
	 *
	 * @param origin - The starting point for navigation
	 * @param candidates - An array of potential target elements.
	 * @param direction - The direction to navigate.
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

	/**
	 * Selects the best spatial navigation candidate that is visible within the specified bounds.
	 *
	 * @param origin - The starting point for navigation.
	 * @param candidates - An array of potential target elements.
	 * @param direction - The direction to navigate.
	 * @param bounds - The clipping rectangle used to determine visibility.
	 * @returns The best visible candidate, or `undefined` if none are suitable.
	 */
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

	/**
	 * Scrolls a container in the specified direction based on the current configuration.
	 * Supports disabling scroll, applying specific scroll offsets and behaviors, or executing a custom scroll function.
	 *
	 * @param container - The container element to scroll.
	 * @param direction - The direction to scroll.
	 */
	#scroll(container: Element, direction: SpavDirection) {
		if (!this.scroll) return;

		if (typeof this.scroll === 'function') {
			this.scroll({ container, direction });
			return;
		}

		let amount = DEFAULT_SCROLL_AMOUNT;
		let behavior = DEFAULT_SCROLL_BEHAVIOR;

		if (typeof this.scroll === 'object') {
			if (this.scroll.amount !== undefined) amount = Math.abs(this.scroll.amount);
			if (this.scroll.behavior) behavior = this.scroll.behavior;
		}

		const offsets = {
			left: { left: -amount },
			right: { left: amount },
			up: { top: -amount },
			down: { top: amount }
		};

		container.scrollBy({ ...offsets[direction], behavior });
	}

	/**
	 * Scrolls a target element into view based on the current configuration.
	 * Supports disabling the action, applying specific scroll options, or executing a custom scroll function.
	 *
	 * @param target - The target element to scroll into view.
	 */
	#scrollIntoView(target: Element) {
		if (!this.scrollIntoView) return;

		if (typeof this.scrollIntoView === 'function') {
			this.scrollIntoView({ target, container: this.#getScrollContainer(target) });
			return;
		}

		const options = typeof this.scrollIntoView === 'object' ? this.scrollIntoView : {};

		target.scrollIntoView({
			inline: DEFAULT_SCROLL_INLINE,
			block: DEFAULT_SCROLL_BLOCK,
			behavior: DEFAULT_SCROLL_BEHAVIOR,
			...options
		});
	}

	/**
	 * Validates and applies focus to a target element.
	 *
	 * @param event - The focus event details.
	 * @returns `true` if the target element was successfully focused, `false` otherwise.
	 */
	#focus({ target, origin, direction }: SpavFocusEvent) {
		if (!this.#isFocusable(target)) return false;

		target.focus({ focusVisible: true, preventScroll: true });
		if (!target.contains(document.activeElement)) return false;

		this.#scrollIntoView(target);
		this.#origin = undefined;
		this.#activeScrollContainer = undefined;
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
		this.#rects.clear();
		this.#focusables.clear();
		this.#scrollContainers.clear();
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
		this.#focusables.clear();
		this.#scrollContainers.clear();

		if (this.#activeScrollContainer && !this.#activeScrollContainer.isConnected) {
			this.#activeScrollContainer = undefined;
		}

		const origin = this.#activeScrollContainer
			? {
					element: this.#activeScrollContainer,
					rect: this.#getRect(this.#activeScrollContainer)
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

		const filterVisible = (candidates: Element[]) =>
			candidates.filter(
				(candidate) =>
					candidate !== origin.element && intersects(this.#getRect(candidate), viewport)
			);

		while (container) {
			const candidates = this.#getCandidates(container);
			const visibleCandidates = filterVisible(candidates);

			if (visibleCandidates.length) {
				let best = this.#selectBestVisible(origin, visibleCandidates, direction, viewport);

				while (best && !this.#isFocusable(best) && this.#isContainer(best)) {
					const visibleInner = filterVisible(this.#getCandidates(best));
					const next = this.#selectBestVisible(origin, visibleInner, direction, viewport);

					// Scroll container entered with no visible targets inside
					if (!next && this.#isScrollContainer(best)) {
						this.#activeScrollContainer = best;
						this.#scrollIntoView(best);
						return;
					}

					best = next;
				}

				// Skip candidate clipped at the trailing edge while scrolling
				if (best && this.#activeScrollContainer) {
					const bestRect = this.#getRect(best);
					const containerRect = this.#getClipRect(this.#activeScrollContainer);

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

			if (this.scroll) {
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
		this.#focusables.clear();
		this.#scrollContainers.clear();

		this.#origin = undefined;
		this.#activeScrollContainer = undefined;
		this.#observer.disconnect();

		this.#indicator?.destroy();
		this.#indicator = undefined;
		this.#indicatorApi = undefined;

		window.removeEventListener('keydown', this.#onKeyDown);
		window.removeEventListener('focusin', this.#onFocusIn);
		window.removeEventListener('focusout', this.#onFocusOut);
		document.removeEventListener('pointerup', this.#onPointerUp);
	}
}
