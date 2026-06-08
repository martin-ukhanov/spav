import { lerp, isFocusableElement } from './utils';
import type { FocusableElement, SpavCursorOptions } from './types';

export class SpavCursor {
	#cursor: HTMLElement;
	#target: FocusableElement | undefined;

	#rect: { render: DOMRect; global: DOMRect; last?: DOMRect };
	#scale: { render: number; target: number };
	#borderRadius: { render: number[]; target: number[] };
	#isSettled: boolean;

	#rafId: number | undefined;
	#lastTime: number | undefined;

	speed: number;
	padding: number;
	matchBorderRadius: boolean;
	autoRaf: boolean;

	constructor({
		speed = 0.25,
		padding = 0,
		matchBorderRadius = true,
		autoRaf = true
	}: SpavCursorOptions = {}) {
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
		});

		this.#rect = { render: new DOMRect(), global: new DOMRect() };
		this.#scale = { render: 0, target: 0 };
		this.#borderRadius = { render: Array(8).fill(0), target: Array(8).fill(0) };
		this.#isSettled = true;

		this.speed = speed;
		this.padding = padding;
		this.matchBorderRadius = matchBorderRadius;
		this.autoRaf = autoRaf;

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
			this.#rect.last = undefined;

			if (isInit) {
				if (this.matchBorderRadius) {
					this.#borderRadius.render = this.#getBorderRadius(target);
				}

				this.#isSettled = true;
				this.#attachToTarget(target);
			} else if (this.#isSettled) {
				this.#isSettled = false;
				this.#attachToGlobal();
			}

			if (this.autoRaf) {
				this.#rafId ??= requestAnimationFrame(this.raf);
			}
		}
	};

	#onFocusOut = (event: FocusEvent) => {
		if (!event.relatedTarget) {
			this.#target = undefined;
			this.#isSettled = true;
			this.#scale.target = 0;
		}
	};

	#getBorderRadius(element: FocusableElement, style?: CSSStyleDeclaration, rect?: DOMRect) {
		const resolve = (value: string, axis: number, scale: number) => {
			const r = value.endsWith('%') ? (parseFloat(value) / 100) * axis : parseFloat(value) * scale;
			return r === 0 ? 0 : r + this.padding;
		};

		if (!style) style = getComputedStyle(element);
		if (!rect) rect = element.getBoundingClientRect();

		let scaleX: number, scaleY: number;

		if (element instanceof HTMLElement) {
			scaleX = element.offsetWidth ? rect.width / element.offsetWidth : 1;
			scaleY = element.offsetHeight ? rect.height / element.offsetHeight : 1;
		} else {
			scaleX = scaleY = 1;
		}

		return [
			style.borderTopLeftRadius,
			style.borderTopRightRadius,
			style.borderBottomRightRadius,
			style.borderBottomLeftRadius
		].flatMap((value) => {
			const [h, v = h] = value.split(' ');
			return [resolve(h, rect.width, scaleX), resolve(v, rect.height, scaleY)];
		});
	}

	#attachToTarget(target: Element) {
		const parent = (target instanceof HTMLElement ? target.offsetParent : null) ?? document.body;
		if (this.#cursor.parentElement !== parent) parent.appendChild(this.#cursor);
	}

	#attachToGlobal() {
		if (this.#cursor.parentElement !== document.body) {
			document.body.appendChild(this.#cursor);
		}

		Object.assign(this.#rect.render, {
			x: this.#rect.global.x,
			y: this.#rect.global.y,
			width: this.#rect.global.width,
			height: this.#rect.global.height
		});

		this.#cursor.style.zIndex = '2147483647';
	}

	#moveTo(rect: DOMRect, progress: number) {
		const target = {
			x: rect.x + window.scrollX,
			y: rect.y + window.scrollY
		};

		const velocity = this.#rect.last
			? new DOMRect(
					target.x - this.#rect.last.x,
					target.y - this.#rect.last.y,
					rect.width - this.#rect.last.width,
					rect.height - this.#rect.last.height
				)
			: new DOMRect();

		this.#rect.last = new DOMRect(target.x, target.y, rect.width, rect.height);

		Object.assign(this.#rect.render, {
			x: lerp(this.#rect.render.x, target.x, progress) + velocity.x,
			y: lerp(this.#rect.render.y, target.y, progress) + velocity.y,
			width: lerp(this.#rect.render.width, rect.width, progress) + velocity.width,
			height: lerp(this.#rect.render.height, rect.height, progress) + velocity.height
		});

		if (this.matchBorderRadius) {
			this.#borderRadius.render = this.#borderRadius.render.map((value, i) =>
				lerp(value, this.#borderRadius.target[i], progress)
			);
		}

		const dx = target.x - this.#rect.render.x;
		const dy = target.y - this.#rect.render.y;
		const dw = rect.width - this.#rect.render.width;
		const dh = rect.height - this.#rect.render.height;

		if (dx * dx + dy * dy + dw * dw + dh * dh < 0.01) {
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

		Object.assign(this.#rect.render, {
			x,
			y,
			width: rect.width,
			height: rect.height
		});

		Object.assign(this.#rect.global, {
			x: rect.x + window.scrollX,
			y: rect.y + window.scrollY,
			width: rect.width,
			height: rect.height
		});

		if (this.matchBorderRadius) {
			this.#borderRadius.render = [...this.#borderRadius.target];
		}
	}

	#render() {
		const p = this.padding;
		const [tlh, tlv, trh, trv, brh, brv, blh, blv] = this.#borderRadius.render;

		Object.assign(this.#cursor.style, {
			width: `${this.#rect.render.width + p * 2}px`,
			height: `${this.#rect.render.height + p * 2}px`,
			translate: `${this.#rect.render.x - p}px ${this.#rect.render.y - p}px`,
			borderRadius: this.matchBorderRadius
				? `${tlh}px ${trh}px ${brh}px ${blh}px / ${tlv}px ${trv}px ${brv}px ${blv}px`
				: '',
			scale: `${this.#scale.render}`
		});
	}

	raf: FrameRequestCallback = (time) => {
		if (!this.#target && this.#scale.render === 0) return;

		const deltaTime = time - (this.#lastTime ?? time);
		const speed = Math.min(Math.max(this.speed, 0.01), 1);
		const progress = 1 - Math.pow(1 - speed, deltaTime / (1000 / 60));

		this.#lastTime = time;
		this.#scale.render = lerp(this.#scale.render, this.#scale.target, progress);

		if (this.#target) {
			const style = getComputedStyle(this.#target);
			const rect = this.#target.getBoundingClientRect();

			if (this.matchBorderRadius) {
				this.#borderRadius.target = this.#getBorderRadius(this.#target, style, rect);
			}

			if (!this.#isSettled) this.#moveTo(rect, progress);

			if (this.#isSettled) {
				const { zIndex } = style;
				this.#cursor.style.zIndex = zIndex !== 'auto' ? zIndex : '';
				this.#snapTo(rect);
			}
		}

		this.#render();

		if (!this.#target && this.#scale.render < 0.01) {
			this.#cursor.style.scale = '0';
			this.#scale.render = 0;
			this.#rafId = undefined;
			this.#lastTime = undefined;
			return;
		}

		if (this.autoRaf) {
			this.#rafId = requestAnimationFrame(this.raf);
		}
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
