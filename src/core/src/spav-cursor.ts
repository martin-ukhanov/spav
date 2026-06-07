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
	#scale: { render: number; target: number };
	#radius: { render: number[]; target: number[] };
	#isSettled: boolean;

	#rafId: number | undefined;
	#lastTime: number | undefined;

	padding: number;
	matchRadius: boolean;

	constructor({ padding = 0, matchRadius = true }: SpavCursorOptions = {}) {
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
		this.#scale = { render: 0, target: 0 };
		this.#radius = { render: [0, 0, 0, 0], target: [0, 0, 0, 0] };
		this.#isSettled = true;

		this.padding = padding;
		this.matchRadius = matchRadius;

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
				if (this.matchRadius) {
					this.#radius.render = this.#getRadius(getComputedStyle(target));
				}

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

	#getRadius(style: CSSStyleDeclaration) {
		return [
			style.borderTopLeftRadius,
			style.borderTopRightRadius,
			style.borderBottomRightRadius,
			style.borderBottomLeftRadius
		].map((value) => {
			const r = parseFloat(value);
			return r === 0 ? 0 : r + this.padding;
		});
	}

	#attachToTarget(target: Element) {
		const parent = (target instanceof HTMLElement ? target.offsetParent : null) ?? document.body;
		if (this.#cursor.parentElement !== parent) parent.appendChild(this.#cursor);
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
		const p = this.padding;
		const [tl, tr, br, bl] = this.#radius.render;

		Object.assign(this.#cursor.style, {
			width: `${this.#rect.render.width + p * 2}px`,
			height: `${this.#rect.render.height + p * 2}px`,
			translate: `${this.#rect.render.x - p}px ${this.#rect.render.y - p}px`,
			borderRadius: this.matchRadius ? `${tl}px ${tr}px ${br}px ${bl}px` : '',
			scale: `${this.#scale.render}`
		} as CSSStyleDeclaration);
	}

	#tick = (time: number) => {
		const deltaTime = time - (this.#lastTime ?? time);
		const progress = 1 - Math.exp(-SMOOTHING * deltaTime);

		this.#lastTime = time;
		this.#scale.render = lerp(this.#scale.render, this.#scale.target, progress);

		if (this.#target) {
			const rect = this.#target.getBoundingClientRect();
			const style = getComputedStyle(this.#target);

			if (this.matchRadius) {
				this.#radius.target = this.#getRadius(style);
				this.#radius.render = this.#radius.render.map((v, i) =>
					lerp(v, this.#radius.target[i], progress)
				);
			}

			if (!this.#isSettled) this.#moveTo(rect, progress);

			if (this.#isSettled) {
				const { zIndex } = style;
				this.#cursor.style.zIndex = zIndex !== 'auto' ? zIndex : '';
				this.#snapTo(rect);
			}
		}

		this.#render();

		if (!this.#target && this.#scale.render < MIN_VISIBLE_SCALE) {
			this.#cursor.style.scale = '0';
			this.#scale.render = 0;
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
