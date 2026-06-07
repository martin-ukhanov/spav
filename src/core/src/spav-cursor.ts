import { setRect, copyRect, lerp, isFocusableElement } from './utils';
import type { FocusableElement } from './types';

const SMOOTHING = 0.015; // exponential follow rate per ms; higher = snappier
const SETTLE_DISTANCE_SQ = 0.5; // squared-px gap at which the glide ends and the cursor latches on
const MIN_VISIBLE_SCALE = 0.001;
const MAX_Z_INDEX = 2147483647;

export class SpavCursor {
	#cursor: HTMLElement;
	#target: FocusableElement | undefined;

	#renderRect: DOMRect;
	#globalRect: DOMRect;

	#currentScale: number;
	#targetScale: number;

	#isSettled: boolean;

	#rafId: number | undefined;
	#lastTime: number | undefined;

	constructor() {
		this.#cursor = document.createElement('div');
		this.#cursor.setAttribute('data-spav-cursor', '');
		this.#cursor.setAttribute('aria-hidden', 'true');

		Object.assign(this.#cursor.style, {
			position: 'absolute',
			top: '0',
			left: '0',
			pointerEvents: 'none',
			scale: '0',
			willChange: 'translate, scale'
		} as CSSStyleDeclaration);

		this.#renderRect = new DOMRect();
		this.#globalRect = new DOMRect();

		this.#currentScale = 0;
		this.#targetScale = 0;

		this.#isSettled = true;

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
			const isInit = !this.#target;

			this.#target = target;
			this.#targetScale = 1;

			if (isInit) {
				this.#isSettled = true;
				this.#attachToTarget(target);
			} else if (this.#isSettled) {
				this.#isSettled = false;
				this.#attachToGlobal();
			}

			this.#rafId ??= requestAnimationFrame(this.#tick);
		}
	};

	#onFocusOut = (event: FocusEvent) => {
		if (!event.relatedTarget) {
			this.#target = undefined;
			this.#isSettled = true;
			this.#targetScale = 0;
		}
	};

	#attachToTarget(target: Element) {
		const parent = (target instanceof HTMLElement ? target.offsetParent : null) ?? document.body;
		if (this.#cursor.parentElement !== parent) parent.appendChild(this.#cursor);

		const targetZIndex = getComputedStyle(target).zIndex;
		this.#cursor.style.zIndex = targetZIndex !== 'auto' ? targetZIndex : '';
	}

	#attachToGlobal() {
		if (this.#cursor.parentElement !== document.body) document.body.appendChild(this.#cursor);
		copyRect(this.#renderRect, this.#globalRect);
		this.#cursor.style.zIndex = String(MAX_Z_INDEX);
	}

	#moveTo(rect: DOMRect, blend: number) {
		const targetX = rect.x + window.scrollX;
		const targetY = rect.y + window.scrollY;

		setRect(
			this.#renderRect,
			lerp(this.#renderRect.x, targetX, blend),
			lerp(this.#renderRect.y, targetY, blend),
			lerp(this.#renderRect.width, rect.width, blend),
			lerp(this.#renderRect.height, rect.height, blend)
		);

		const dx = targetX - this.#renderRect.x;
		const dy = targetY - this.#renderRect.y;
		const dw = rect.width - this.#renderRect.width;
		const dh = rect.height - this.#renderRect.height;

		if (dx * dx + dy * dy + dw * dw + dh * dh < SETTLE_DISTANCE_SQ) {
			this.#isSettled = true;
			this.#attachToTarget(this.#target!);
		}
	}

	#snapTo(rect: DOMRect) {
		const parent = this.#cursor.offsetParent;

		let localX: number;
		let localY: number;

		if (parent && parent !== document.documentElement && parent !== document.body) {
			const parentRect = parent.getBoundingClientRect();
			localX = rect.x - parentRect.x - parent.clientLeft + parent.scrollLeft;
			localY = rect.y - parentRect.y - parent.clientTop + parent.scrollTop;
		} else {
			localX = rect.x + window.scrollX;
			localY = rect.y + window.scrollY;
		}

		setRect(this.#renderRect, localX, localY, rect.width, rect.height);

		setRect(
			this.#globalRect,
			rect.x + window.scrollX,
			rect.y + window.scrollY,
			rect.width,
			rect.height
		);
	}

	#render() {
		Object.assign(this.#cursor.style, {
			width: `${this.#renderRect.width}px`,
			height: `${this.#renderRect.height}px`,
			translate: `${this.#renderRect.x}px ${this.#renderRect.y}px`,
			scale: `${this.#currentScale}`
		} as CSSStyleDeclaration);
	}

	#tick = (time: number) => {
		const deltaTime = time - (this.#lastTime ?? time);
		const blend = 1 - Math.exp(-SMOOTHING * deltaTime);

		this.#lastTime = time;
		this.#currentScale = lerp(this.#currentScale, this.#targetScale, blend);

		if (this.#target) {
			const rect = this.#target.getBoundingClientRect();
			if (!this.#isSettled) this.#moveTo(rect, blend);
			if (this.#isSettled) this.#snapTo(rect);
		}

		this.#render();

		if (!this.#target && this.#currentScale < MIN_VISIBLE_SCALE) {
			this.#cursor.style.scale = '0';
			this.#currentScale = 0;
			this.#lastTime = undefined;
			this.#rafId = undefined;
			return;
		}

		this.#rafId = requestAnimationFrame(this.#tick);
	};

	destroy() {
		if (this.#rafId !== undefined) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = undefined;
		}

		this.#cursor.remove();

		window.removeEventListener('focusin', this.#onFocusIn);
		window.removeEventListener('focusout', this.#onFocusOut);
	}
}
