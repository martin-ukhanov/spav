import { lerp, setRect, setStyle, isFocusableElement } from './utils';
import type { FocusableElement, SpavIndicatorOptions } from './types';

export class SpavIndicator {
	#indicator: HTMLElement;
	#target: FocusableElement | undefined;

	#rect: { current: DOMRect; offset?: DOMRect };
	#borderRadius: { current: number[]; offset?: number[] };
	#scale: { current: number; target: number };

	#isSettled: boolean;
	#isIntersecting: boolean;
	#isPointer: boolean;

	#observer: IntersectionObserver;

	#rafId: number | undefined;
	#lastTime: number | undefined;
	#lastStyle: string | undefined;

	speed: number;
	padding: number;
	matchBorderRadius: boolean;
	autoRaf: boolean;

	get #isDormant() {
		return (!this.#target || !this.#isIntersecting) && !this.#scale.current;
	}

	constructor({
		speed = 0.25,
		padding = 0,
		matchBorderRadius = true,
		autoRaf = true
	}: SpavIndicatorOptions = {}) {
		this.#indicator = document.createElement('div');
		this.#indicator.dataset.spavIndicator = '';
		this.#indicator.ariaHidden = 'true';

		setStyle(this.#indicator, {
			position: 'fixed',
			top: '0',
			left: '0',
			zIndex: '2147483647',
			pointerEvents: 'none',
			scale: '0',
			willChange: 'translate, scale'
		});

		this.#rect = { current: new DOMRect() };
		this.#borderRadius = { current: Array(8).fill(0) };
		this.#scale = { current: 0, target: 0 };

		this.#isSettled = true;
		this.#isIntersecting = true;
		this.#isPointer = false;

		this.#observer = new IntersectionObserver(this.#onIntersect);

		this.speed = speed;
		this.padding = padding;
		this.matchBorderRadius = matchBorderRadius;
		this.autoRaf = autoRaf;

		document.body.append(this.#indicator);

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
			this.#rect.offset = undefined;
			this.#borderRadius.offset = undefined;
			this.#scale.target = 1;

			this.#isIntersecting = true;
			this.#observer.disconnect();
			this.#observer.observe(target);

			if (isInit) {
				this.#isSettled = true;
				if (this.matchBorderRadius) this.#borderRadius.current = this.#getBorderRadius(target);
			} else if (this.#isSettled) {
				this.#isSettled = false;
			}

			if (this.autoRaf) this.#rafId ??= requestAnimationFrame(this.raf);
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
					this.#rect.offset = undefined;
					this.#borderRadius.offset = undefined;
					this.#isSettled = true;
				}

				if (this.autoRaf) this.#rafId ??= requestAnimationFrame(this.raf);
			}
		}
	};

	#getBorderRadius(element: FocusableElement, rect?: DOMRect) {
		const resolve = (value: string, axis: number, scale: number) => {
			if (value.startsWith('calc(')) {
				let total = 0;

				for (const term of value.slice(5, -1).replaceAll(' - ', ' + -').split(' + ')) {
					total += resolve(term, axis, scale);
				}

				return Math.max(0, total);
			}

			const number = parseFloat(value);
			if (Number.isNaN(number)) return 0; // Unsupported, e.g. min(), max(), clamp()

			return value.endsWith('%') ? (number / 100) * axis : number * scale;
		};

		const style = getComputedStyle(element);
		if (!rect) rect = element.getBoundingClientRect();

		let scaleX: number, scaleY: number;

		if (element instanceof HTMLElement) {
			scaleX = element.offsetWidth ? rect.width / element.offsetWidth : 1;
			scaleY = element.offsetHeight ? rect.height / element.offsetHeight : 1;
		} else {
			scaleX = scaleY = 1;
		}

		const [tlh, tlv, trh, trv, brh, brv, blh, blv] = [
			style.borderTopLeftRadius,
			style.borderTopRightRadius,
			style.borderBottomRightRadius,
			style.borderBottomLeftRadius
		].flatMap((value) => {
			const [h, v = h] = value.split(/\s+(?![^()]*\))/); // Skip spaces inside calc()
			return [resolve(h, rect.width, scaleX), resolve(v, rect.height, scaleY)];
		});

		const factor = Math.min(
			1,
			rect.width / (tlh + trh),
			rect.width / (blh + brh),
			rect.height / (tlv + blv),
			rect.height / (trv + brv)
		);

		return [tlh, tlv, trh, trv, brh, brv, blh, blv].map((r) =>
			r === 0 ? 0 : r * factor + this.padding
		);
	}

	#moveTo(rect: DOMRect, borderRadius: number[] | undefined, progress: number) {
		const rectOffset = (this.#rect.offset ??= new DOMRect(
			this.#rect.current.x - rect.x,
			this.#rect.current.y - rect.y,
			this.#rect.current.width - rect.width,
			this.#rect.current.height - rect.height
		));

		setRect(rectOffset, {
			x: lerp(rectOffset.x, 0, progress),
			y: lerp(rectOffset.y, 0, progress),
			width: lerp(rectOffset.width, 0, progress),
			height: lerp(rectOffset.height, 0, progress)
		});

		setRect(this.#rect.current, {
			x: rect.x + rectOffset.x,
			y: rect.y + rectOffset.y,
			width: rect.width + rectOffset.width,
			height: rect.height + rectOffset.height
		});

		if (borderRadius) {
			const borderRadiusOffset = (
				this.#borderRadius.offset ??
				this.#borderRadius.current.map((value, i) => value - borderRadius[i])
			).map((value) => lerp(value, 0, progress));

			this.#borderRadius.offset = borderRadiusOffset;
			this.#borderRadius.current = borderRadius.map((value, i) => value + borderRadiusOffset[i]);
		}

		const { x, y, width: w, height: h } = rectOffset;
		if (x * x + y * y + w * w + h * h < 0.01) this.#isSettled = true;
	}

	#snapTo(rect: DOMRect, borderRadius?: number[]) {
		setRect(this.#rect.current, rect);
		if (borderRadius) this.#borderRadius.current = [...borderRadius];
	}

	#render() {
		const p = this.padding;
		const { x, y, width, height } = this.#rect.current;
		const [tlh, tlv, trh, trv, brh, brv, blh, blv] = this.#borderRadius.current;

		const style = {
			width: `${width + p * 2}px`,
			height: `${height + p * 2}px`,
			translate: `${x - p}px ${y - p}px`,
			borderRadius: this.matchBorderRadius
				? `${tlh}px ${trh}px ${brh}px ${blh}px / ${tlv}px ${trv}px ${brv}px ${blv}px`
				: '',
			scale: `${this.#scale.current}`
		};

		const signature = `${style.width} ${style.height} ${style.translate} ${style.borderRadius} ${style.scale}`;
		if (signature === this.#lastStyle) return;

		this.#lastStyle = signature;
		setStyle(this.#indicator, style);
	}

	#hide() {
		this.#target = undefined;
		this.#isSettled = true;
		this.#scale.target = 0;
		this.#observer.disconnect();
	}

	raf: FrameRequestCallback = (time) => {
		this.#rafId = undefined;
		if (this.#isDormant) return;

		const deltaTime = time - (this.#lastTime ?? time);
		const speed = Math.min(Math.max(this.speed, 0.01), 1);
		const progress = 1 - Math.pow(1 - speed, deltaTime / (1000 / 60));

		this.#lastTime = time;
		this.#scale.current = lerp(this.#scale.current, this.#scale.target, progress);

		if (Math.abs(this.#scale.target - this.#scale.current) < 0.01) {
			this.#scale.current = this.#scale.target;
		}

		if (this.#target && this.#isIntersecting) {
			const rect = this.#target.getBoundingClientRect();
			const borderRadius = this.matchBorderRadius
				? this.#getBorderRadius(this.#target, rect)
				: undefined;

			if (!this.#isSettled) this.#moveTo(rect, borderRadius, progress);
			if (this.#isSettled) this.#snapTo(rect, borderRadius);
		}

		this.#render();

		if (this.#isDormant) {
			this.#lastTime = undefined;
			return;
		}

		if (this.autoRaf) this.#rafId = requestAnimationFrame(this.raf);
	};

	destroy() {
		if (this.#rafId !== undefined) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = undefined;
		}

		this.#observer.disconnect();
		this.#indicator.remove();

		window.removeEventListener('focusin', this.#onFocusIn);
		window.removeEventListener('focusout', this.#onFocusOut);
		window.removeEventListener('pointerdown', this.#onPointerDown, true);
		window.removeEventListener('keydown', this.#onKeyDown, true);
	}
}
