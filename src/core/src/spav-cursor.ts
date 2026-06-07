import { setRect, copyRect, lerp, isFocusableElement } from './utils';
import type { FocusableElement, SpavCursorOptions } from './types';

const MAX_Z_INDEX = 2147483647;
const SETTLE_DISTANCE_SQ = 0.5;
const MIN_VISIBLE_SCALE = 0.001;
const SMOOTHING = 0.015;

export class SpavCursor {
	#cursor: HTMLElement;
	#target: FocusableElement | undefined;

	#rect: { render: DOMRect; global: DOMRect };
	#scale: { current: number; target: number };
	#isSettled: boolean;

	#rafId: number | undefined;
	#lastTime: number | undefined;

	padding: number;

	constructor({ padding = 0 }: SpavCursorOptions = {}) {
		this.#cursor = document.createElement('div');
		this.#cursor.dataset.spavCursor = '';
		this.#cursor.ariaHidden = 'true';

		Object.assign(this.#cursor.style, {
			position: 'absolute',
			top: '0',
			left: '0',
			pointerEvents: 'none',
			scale: '0',
			willChange: 'translate, scale'
		} as CSSStyleDeclaration);

		this.#rect = { render: new DOMRect(), global: new DOMRect() };
		this.#scale = { current: 0, target: 0 };
		this.#isSettled = true;

		this.padding = padding;

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
			this.#scale.target = 1;

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
			this.#scale.target = 0;
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
		copyRect(this.#rect.render, this.#rect.global);
		this.#cursor.style.zIndex = String(MAX_Z_INDEX);
	}

	#moveTo(rect: DOMRect, progress: number) {
		const targetX = rect.x + window.scrollX;
		const targetY = rect.y + window.scrollY;

		setRect(
			this.#rect.render,
			lerp(this.#rect.render.x, targetX, progress),
			lerp(this.#rect.render.y, targetY, progress),
			lerp(this.#rect.render.width, rect.width, progress),
			lerp(this.#rect.render.height, rect.height, progress)
		);

		const dx = targetX - this.#rect.render.x;
		const dy = targetY - this.#rect.render.y;
		const dw = rect.width - this.#rect.render.width;
		const dh = rect.height - this.#rect.render.height;

		if (dx * dx + dy * dy + dw * dw + dh * dh < SETTLE_DISTANCE_SQ) {
			this.#isSettled = true;
			if (this.#target) this.#attachToTarget(this.#target);
		}
	}

	#snapTo(rect: DOMRect) {
		const parent = this.#cursor.offsetParent;
		let x: number, y: number;

		if (parent && parent !== document.documentElement && parent !== document.body) {
			const parentRect = parent.getBoundingClientRect();
			x = rect.x - parentRect.x - parent.clientLeft + parent.scrollLeft;
			y = rect.y - parentRect.y - parent.clientTop + parent.scrollTop;
		} else {
			x = rect.x + window.scrollX;
			y = rect.y + window.scrollY;
		}

		setRect(this.#rect.render, x, y, rect.width, rect.height);

		setRect(
			this.#rect.global,
			rect.x + window.scrollX,
			rect.y + window.scrollY,
			rect.width,
			rect.height
		);
	}

	#render() {
		Object.assign(this.#cursor.style, {
			width: `${this.#rect.render.width + this.padding * 2}px`,
			height: `${this.#rect.render.height + this.padding * 2}px`,
			translate: `${this.#rect.render.x - this.padding}px ${this.#rect.render.y - this.padding}px`,
			scale: `${this.#scale.current}`
		} as CSSStyleDeclaration);
	}

	#tick = (time: number) => {
		const deltaTime = time - (this.#lastTime ?? time);
		const progress = 1 - Math.exp(-SMOOTHING * deltaTime);

		this.#lastTime = time;
		this.#scale.current = lerp(this.#scale.current, this.#scale.target, progress);

		if (this.#target) {
			const rect = this.#target.getBoundingClientRect();
			if (!this.#isSettled) this.#moveTo(rect, progress);
			if (this.#isSettled) this.#snapTo(rect);
		}

		this.#render();

		if (!this.#target && this.#scale.current < MIN_VISIBLE_SCALE) {
			this.#cursor.style.scale = '0';
			this.#scale.current = 0;
			this.#rafId = undefined;
			this.#lastTime = undefined;
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
