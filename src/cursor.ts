import { lerp, setRect, setStyle, isFocusableElement } from './utils';
import type { FocusableElement, SpavCursorOptions } from './types';

export class SpavCursor {
	#cursor: HTMLElement;
	#target: FocusableElement | undefined;

	#rect: { current: DOMRect; last?: DOMRect };
	#scale: { current: number; target: number };
	#borderRadius: { current: number[]; target: number[] };

	#isSettled: boolean;
	#isIntersecting: boolean;
	#isPointer: boolean;

	#observer: IntersectionObserver;

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

		setStyle(this.#cursor, {
			position: 'fixed',
			top: '0',
			left: '0',
			zIndex: '2147483647',
			pointerEvents: 'none',
			scale: '0',
			willChange: 'translate, scale'
		});

		this.#rect = { current: new DOMRect() };
		this.#scale = { current: 0, target: 0 };
		this.#borderRadius = { current: Array(8).fill(0), target: Array(8).fill(0) };

		this.#isSettled = true;
		this.#isIntersecting = true;
		this.#isPointer = false;

		this.#observer = new IntersectionObserver(this.#onIntersect);

		this.speed = speed;
		this.padding = padding;
		this.matchBorderRadius = matchBorderRadius;
		this.autoRaf = autoRaf;

		document.body.append(this.#cursor);

		window.addEventListener('focusin', this.#onFocusIn);
		window.addEventListener('focusout', this.#onFocusOut);
		window.addEventListener('pointerdown', this.#onPointerDown, true);
		window.addEventListener('keydown', this.#onKeyDown, true);
	}

	#onFocusIn = (event: FocusEvent) => {
		const { target } = event;

		if (
			!this.#isPointer &&
			target instanceof Element &&
			target !== document.body &&
			isFocusableElement(target) &&
			target.matches(':focus-visible')
		) {
			const isInit = !this.#target;

			this.#target = target;
			this.#rect.last = undefined;
			this.#scale.target = 1;

			this.#isIntersecting = true;
			this.#observer.disconnect();
			this.#observer.observe(target);

			if (isInit) {
				this.#isSettled = true;

				if (this.matchBorderRadius) {
					this.#borderRadius.current = this.#getBorderRadius(target);
				}
			} else if (this.#isSettled) {
				this.#isSettled = false;
			}

			if (this.autoRaf) {
				this.#rafId ??= requestAnimationFrame(this.raf);
			}
		} else if (this.#target) {
			this.#hide();
		}
	};

	#onFocusOut = (event: FocusEvent) => {
		if (!event.relatedTarget) this.#hide();
	};

	#onPointerDown = () => {
		this.#isPointer = true;
	};

	#onKeyDown = () => {
		this.#isPointer = false;
	};

	#onIntersect: IntersectionObserverCallback = (entries) => {
		for (const entry of entries) {
			if (entry.target !== this.#target) continue;

			const wasIntersecting = this.#isIntersecting;
			this.#isIntersecting = entry.isIntersecting;
			this.#scale.target = entry.isIntersecting ? 1 : 0;

			if (entry.isIntersecting) {
				if (!wasIntersecting) {
					this.#rect.last = undefined;
					this.#isSettled = true;
				}

				if (this.autoRaf) {
					this.#rafId ??= requestAnimationFrame(this.raf);
				}
			}
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

	#moveTo(rect: DOMRect, progress: number) {
		const { x, y, width, height } = rect;

		const velocity = this.#rect.last
			? new DOMRect(
					x - this.#rect.last.x,
					y - this.#rect.last.y,
					width - this.#rect.last.width,
					height - this.#rect.last.height
				)
			: new DOMRect();

		this.#rect.last = rect;

		setRect(this.#rect.current, {
			x: lerp(this.#rect.current.x, x, progress) + velocity.x,
			y: lerp(this.#rect.current.y, y, progress) + velocity.y,
			width: lerp(this.#rect.current.width, width, progress) + velocity.width,
			height: lerp(this.#rect.current.height, height, progress) + velocity.height
		});

		if (this.matchBorderRadius) {
			this.#borderRadius.current = this.#borderRadius.current.map((value, i) =>
				lerp(value, this.#borderRadius.target[i], progress)
			);
		}

		const dx = x - this.#rect.current.x;
		const dy = y - this.#rect.current.y;
		const dw = width - this.#rect.current.width;
		const dh = height - this.#rect.current.height;

		if (dx * dx + dy * dy + dw * dw + dh * dh < 0.01) {
			this.#isSettled = true;
		}
	}

	#snapTo(rect: DOMRect) {
		setRect(this.#rect.current, rect);

		if (this.matchBorderRadius) {
			this.#borderRadius.current = [...this.#borderRadius.target];
		}
	}

	#render() {
		const p = this.padding;
		const [tlh, tlv, trh, trv, brh, brv, blh, blv] = this.#borderRadius.current;

		setStyle(this.#cursor, {
			width: `${this.#rect.current.width + p * 2}px`,
			height: `${this.#rect.current.height + p * 2}px`,
			translate: `${this.#rect.current.x - p}px ${this.#rect.current.y - p}px`,
			borderRadius: this.matchBorderRadius
				? `${tlh}px ${trh}px ${brh}px ${blh}px / ${tlv}px ${trv}px ${brv}px ${blv}px`
				: '',
			scale: `${this.#scale.current}`
		});
	}

	#hide() {
		this.#target = undefined;
		this.#isSettled = true;
		this.#scale.target = 0;
		this.#observer.disconnect();
	}

	raf: FrameRequestCallback = (time) => {
		if ((!this.#target || !this.#isIntersecting) && this.#scale.current === 0) return;

		const deltaTime = time - (this.#lastTime ?? time);
		const speed = Math.min(Math.max(this.speed, 0.01), 1);
		const progress = 1 - Math.pow(1 - speed, deltaTime / (1000 / 60));

		this.#lastTime = time;
		this.#scale.current = lerp(this.#scale.current, this.#scale.target, progress);

		if (this.#target && this.#isIntersecting) {
			const style = getComputedStyle(this.#target);
			const rect = this.#target.getBoundingClientRect();

			if (this.matchBorderRadius) {
				this.#borderRadius.target = this.#getBorderRadius(this.#target, style, rect);
			}

			if (!this.#isSettled) this.#moveTo(rect, progress);
			if (this.#isSettled) this.#snapTo(rect);
		}

		this.#render();

		if ((!this.#target || !this.#isIntersecting) && this.#scale.current < 0.01) {
			setStyle(this.#cursor, { scale: '0' });
			this.#scale.current = 0;
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

		this.#observer.disconnect();
		this.#cursor.remove();

		window.removeEventListener('focusin', this.#onFocusIn);
		window.removeEventListener('focusout', this.#onFocusOut);
		window.removeEventListener('pointerdown', this.#onPointerDown, true);
		window.removeEventListener('keydown', this.#onKeyDown, true);
	}
}
