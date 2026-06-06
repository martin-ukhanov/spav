import { isFocusableElement } from './utils';
import type { FocusableElement } from './types';

export class SpavCursor {
	#cursor: HTMLElement;
	#target: FocusableElement | undefined;

	#rafId: number | undefined;
	#lastTime: number | undefined;

	#isSettled: boolean = true;

	#currentRect: DOMRect;
	#lastRect: DOMRect;

	constructor() {
		this.#cursor = document.createElement('div');
		this.#cursor.setAttribute('data-spav-cursor', '');
		this.#cursor.setAttribute('aria-hidden', 'true');

		Object.assign(this.#cursor.style, {
			position: 'absolute',
			top: '0',
			left: '0',
			pointerEvents: 'none',
			opacity: '0',
			transition: 'opacity 0.15s ease',
			willChange: 'transform'
		} as CSSStyleDeclaration);

		this.#currentRect = new DOMRect();
		this.#lastRect = new DOMRect();

		window.addEventListener('focusin', this.#onFocusIn);
		window.addEventListener('focusout', this.#onFocusOut);
	}

	#attachToGlobal = () => {
		if (this.#cursor.parentElement !== document.body) {
			document.body.appendChild(this.#cursor);
		}

		this.#currentRect.x = this.#lastRect.x;
		this.#currentRect.y = this.#lastRect.y;
		this.#currentRect.width = this.#lastRect.width;
		this.#currentRect.height = this.#lastRect.height;

		Object.assign(this.#cursor.style, {
			zIndex: '2147483647',
			translate: `${this.#currentRect.x}px ${this.#currentRect.y}px`
		} as CSSStyleDeclaration);
	};

	#attachToTarget = (target: Element) => {
		const offsetParent = (target as HTMLElement).offsetParent ?? document.body;

		if (this.#cursor.parentElement !== offsetParent) {
			offsetParent.appendChild(this.#cursor);
		}

		const targetZIndex = getComputedStyle(target).zIndex;
		this.#cursor.style.zIndex = targetZIndex !== 'auto' ? targetZIndex : '';
	};

	#onFocusIn = (event: FocusEvent) => {
		const { target } = event;

		if (
			target instanceof Element &&
			target !== document.body &&
			isFocusableElement(target) &&
			target.matches(':focus-visible')
		) {
			const isFirstAppearance = !this.#target;
			this.#target = target;

			if (isFirstAppearance) {
				this.#isSettled = true;
				this.#attachToTarget(target);
			} else {
				if (this.#isSettled) {
					this.#isSettled = false;
					this.#attachToGlobal();
				}
			}

			if (this.#rafId === undefined) {
				this.#rafId = requestAnimationFrame(this.#tick);
			}
		}
	};

	#onFocusOut = (event: FocusEvent) => {
		if (!event.relatedTarget) {
			this.#target = undefined;
			this.#isSettled = true;
		}
	};

	#tick = (time: number) => {
		if (!this.#target) {
			this.#cursor.style.opacity = '0';
			this.#lastTime = undefined;
			this.#rafId = undefined;
			return;
		}

		const dt = time - (this.#lastTime ?? time);
		this.#lastTime = time;

		const rect = this.#target.getBoundingClientRect();

		if (!this.#isSettled) {
			const targetX = rect.x + window.scrollX;
			const targetY = rect.y + window.scrollY;
			const blend = 1 - Math.exp(-0.015 * dt);

			this.#currentRect.x += (targetX - this.#currentRect.x) * blend;
			this.#currentRect.y += (targetY - this.#currentRect.y) * blend;
			this.#currentRect.width += (rect.width - this.#currentRect.width) * blend;
			this.#currentRect.height += (rect.height - this.#currentRect.height) * blend;

			this.#lastRect.x = this.#currentRect.x;
			this.#lastRect.y = this.#currentRect.y;
			this.#lastRect.width = this.#currentRect.width;
			this.#lastRect.height = this.#currentRect.height;

			const distSq =
				Math.pow(targetX - this.#currentRect.x, 2) +
				Math.pow(targetY - this.#currentRect.y, 2) +
				Math.pow(rect.width - this.#currentRect.width, 2) +
				Math.pow(rect.height - this.#currentRect.height, 2);

			if (distSq < 0.5) {
				this.#isSettled = true;
				this.#attachToTarget(this.#target);
			}
		}

		if (this.#isSettled) {
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

			this.#currentRect.x = localX;
			this.#currentRect.y = localY;
			this.#currentRect.width = rect.width;
			this.#currentRect.height = rect.height;

			this.#lastRect.x = rect.x + window.scrollX;
			this.#lastRect.y = rect.y + window.scrollY;
			this.#lastRect.width = rect.width;
			this.#lastRect.height = rect.height;
		}

		Object.assign(this.#cursor.style, {
			opacity: '1',
			width: `${this.#currentRect.width}px`,
			height: `${this.#currentRect.height}px`,
			translate: `${this.#currentRect.x}px ${this.#currentRect.y}px`
		} as CSSStyleDeclaration);

		this.#rafId = requestAnimationFrame(this.#tick);
	};

	destroy() {
		window.removeEventListener('focusin', this.#onFocusIn);
		window.removeEventListener('focusout', this.#onFocusOut);

		if (this.#rafId !== undefined) {
			cancelAnimationFrame(this.#rafId);
		}

		this.#cursor.remove();
	}
}
