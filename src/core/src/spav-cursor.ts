import { isFocusableElement } from './utils';
import type { FocusableElement, SpavCursorOptions } from './types';

const ANCHOR_NAME = '--spav-cursor';

export class SpavCursor {
	#element: HTMLElement;

	#rect: DOMRect | undefined;
	#rafId: number | undefined;

	#target: FocusableElement | undefined;
	#originalAnchorName: string | undefined;
	#inTransit: boolean;

	#scaleAnimation: Animation | undefined;
	#transitAnimation: Animation | undefined;

	padding: number;
	duration: EffectTiming['duration'];
	easing: EffectTiming['easing'];
	matchBorderRadius: boolean;

	constructor({
		padding = 0,
		duration = 250,
		easing = 'ease',
		matchBorderRadius = true
	}: SpavCursorOptions = {}) {
		this.#inTransit = false;
		this.padding = padding;
		this.duration = duration;
		this.easing = easing;
		this.matchBorderRadius = matchBorderRadius;

		this.#element = document.createElement('div');
		this.#element.setAttribute('data-spav-cursor', '');
		this.#element.setAttribute('aria-hidden', 'true');

		Object.assign(this.#element.style, {
			position: 'absolute',
			positionAnchor: ANCHOR_NAME,
			pointerEvents: 'none',
			scale: '0',
			willChange: 'transform',
			contain: 'layout'
		});

		document.body.appendChild(this.#element);

		window.addEventListener('focusin', this.#onFocusIn);
		window.addEventListener('focusout', this.#onFocusOut);
	}

	#onFocusIn = (event: FocusEvent) => {
		const { target } = event;

		if (
			target instanceof Element &&
			target !== document.body &&
			isFocusableElement(target) &&
			target.matches(':focus-visible')
		) {
			this.#setTarget(target);
		}
	};

	#onFocusOut = (event: FocusEvent) => {
		if (event.relatedTarget) return;
		if (event.target !== this.#target) return;
		this.#setTarget(undefined);
	};

	#getDesiredParent(target: Element) {
		const parent = target instanceof HTMLElement ? target.offsetParent : null;
		return parent ?? document.body;
	}

	#setAnchorName(element: FocusableElement) {
		const original = element.style.anchorName;
		this.#originalAnchorName = original;

		if (original && original !== 'none') {
			if (!original.includes(ANCHOR_NAME)) {
				element.style.anchorName = `${original}, ${ANCHOR_NAME}`;
			}
		} else {
			element.style.anchorName = ANCHOR_NAME;
		}
	}

	#clearAnchorName(element: FocusableElement | undefined) {
		if (!element) return;
		element.style.anchorName = this.#originalAnchorName ?? '';
		this.#originalAnchorName = undefined;
	}

	#setAnchor() {
		Object.assign(this.#element.style, {
			top: `calc(anchor(top) - ${this.padding}px)`,
			left: `calc(anchor(left) - ${this.padding}px)`,
			width: `calc(anchor-size(width) + ${this.padding * 2}px)`,
			height: `calc(anchor-size(height) + ${this.padding * 2}px)`
		});
	}

	#paddedRect(rect: DOMRect) {
		return new DOMRect(
			rect.left - this.padding,
			rect.top - this.padding,
			rect.width + this.padding * 2,
			rect.height + this.padding * 2
		);
	}

	/**
	 * Offsets a computed corner radius by `padding` so the cursor stays concentric with its
	 * target. A corner may hold one (circular) or two (elliptical) components; a non-zero `px`
	 * length grows by `padding` (clamped at 0), while a sharp (0) corner stays sharp and
	 * percentages or other units scale with the box already.
	 */
	#paddedRadius(radius: string) {
		if (!this.padding) return radius;

		return radius
			.split(' ')
			.map((part) => {
				if (!part.endsWith('px')) return part;

				const value = parseFloat(part);
				return value === 0 ? part : `${Math.max(0, value + this.padding)}px`;
			})
			.join(' ');
	}

	/** Copies the target's per-corner border radius onto the cursor, adjusted for `padding`. */
	#matchRadius(target: FocusableElement) {
		const style = getComputedStyle(target);

		this.#element.style.borderTopLeftRadius = this.#paddedRadius(style.borderTopLeftRadius);
		this.#element.style.borderTopRightRadius = this.#paddedRadius(style.borderTopRightRadius);
		this.#element.style.borderBottomRightRadius = this.#paddedRadius(style.borderBottomRightRadius);
		this.#element.style.borderBottomLeftRadius = this.#paddedRadius(style.borderBottomLeftRadius);
	}

	#reinsert() {
		const parent = this.#element.parentElement;
		if (!parent) return;
		this.#element.remove();
		parent.append(this.#element);
	}

	#enterTransit() {
		this.#element.style.position = 'fixed';
		this.#element.style.zIndex = '2147483647';
		this.#inTransit = true;
	}

	#exitTransit() {
		this.#element.style.position = 'absolute';
		this.#element.style.zIndex = '';
		this.#inTransit = false;
		this.#reinsert();
	}

	#animateScale(to: number) {
		if (this.#scaleAnimation) {
			this.#scaleAnimation.commitStyles();
			this.#scaleAnimation.cancel();
		}

		this.#scaleAnimation = this.#element.animate(
			{ scale: to },
			{
				duration: this.duration,
				easing: this.easing,
				fill: 'forwards'
			}
		);

		this.#scaleAnimation.onfinish = () => {
			this.#scaleAnimation?.commitStyles();
			this.#scaleAnimation?.cancel();
		};
	}

	#getCursorRect(anchor: FocusableElement | undefined) {
		if (this.#rect && !anchor?.checkVisibility()) {
			return this.#rect;
		}

		return this.#element.getBoundingClientRect();
	}

	#trackRect = () => {
		if (!this.#target) {
			this.#rafId = undefined;
			return;
		}

		if (this.#target.checkVisibility()) {
			this.#rect = this.#element.getBoundingClientRect();
			if (this.matchBorderRadius) this.#matchRadius(this.#target);
		}

		this.#rafId = requestAnimationFrame(this.#trackRect);
	};

	#startTracking() {
		if (this.#rafId === undefined) {
			this.#rafId = requestAnimationFrame(this.#trackRect);
		}
	}

	#setTarget(target: FocusableElement | undefined) {
		if (target === this.#target) return;

		const lastTarget = this.#target;
		this.#target = target;

		if (!target) {
			this.#hide(lastTarget);
			return;
		}

		this.#startTracking();
		this.#moveTo(target, lastTarget);
	}

	/** Freezes the cursor at its current position and scales it out. */
	#hide(lastTarget: FocusableElement | undefined) {
		const rect = this.#getCursorRect(lastTarget);

		this.#transitAnimation?.cancel();
		this.#transitAnimation = undefined;

		this.#enterTransit();
		this.#element.style.top = `${rect.top}px`;
		this.#element.style.left = `${rect.left}px`;
		this.#element.style.width = `${rect.width}px`;
		this.#element.style.height = `${rect.height}px`;

		this.#clearAnchorName(lastTarget);
		this.#animateScale(0);
	}

	/** Moves the cursor onto `target`, animating from its current position. */
	#moveTo(target: FocusableElement, lastTarget: FocusableElement | undefined) {
		const from = this.#getCursorRect(lastTarget);
		const to = this.#paddedRect(target.getBoundingClientRect());

		// Remember where the cursor settles now, as the from-rect fallback next time.
		this.#rect = to;

		const desiredParent = this.#getDesiredParent(target);
		const needsReparent = this.#element.parentElement !== desiredParent;

		this.#clearAnchorName(lastTarget);
		this.#setAnchorName(target);

		// First appearance: no prior position to travel from, so settle and scale in.
		if (!lastTarget) {
			if (needsReparent) desiredParent.appendChild(this.#element);
			this.#setAnchor();
			this.#exitTransit();
			this.#animateScale(1);
			return;
		}

		// Already mid-transit toward the same parent: land there before re-aiming.
		if (this.#inTransit && this.#getDesiredParent(lastTarget) === desiredParent) {
			if (needsReparent) desiredParent.appendChild(this.#element);
			this.#exitTransit();
		}

		// Crossing parents (or interrupting a transit): animate from the body in fixed
		// positioning, then settle into the desired parent when the animation finishes.
		if (this.#inTransit || needsReparent) {
			if (this.#element.parentElement !== document.body) {
				document.body.appendChild(this.#element);
			}

			this.#enterTransit();
		}

		const deltaX = from.left - to.left;
		const deltaY = from.top - to.top;

		this.#transitAnimation?.cancel();
		this.#transitAnimation = this.#element.animate(
			[
				{
					translate: `${deltaX}px ${deltaY}px`,
					width: `${from.width}px`,
					height: `${from.height}px`
				},
				{
					translate: '0 0',
					width: `${to.width}px`,
					height: `${to.height}px`
				}
			],
			{
				duration: this.duration,
				easing: this.easing,
				fill: 'none'
			}
		);

		this.#transitAnimation.onfinish = () => {
			if (this.#inTransit) {
				if (this.#element.parentElement !== desiredParent) desiredParent.appendChild(this.#element);
				this.#exitTransit();
			}

			this.#transitAnimation = undefined;
		};
	}

	destroy() {
		if (this.#rafId !== undefined) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = undefined;
		}

		this.#scaleAnimation?.cancel();
		this.#transitAnimation?.cancel();
		this.#scaleAnimation = undefined;
		this.#transitAnimation = undefined;

		this.#clearAnchorName(this.#target);
		this.#target = undefined;
		this.#element.remove();

		window.removeEventListener('focusin', this.#onFocusIn);
		window.removeEventListener('focusout', this.#onFocusOut);
	}
}
