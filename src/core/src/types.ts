export type FocusableElement = HTMLElement | SVGElement | MathMLElement;

export interface Origin {
	element?: Element;
	rect: DOMRect;
}

export type SpavDirection = 'left' | 'right' | 'up' | 'down';

export interface SpavScrollOptions {
	/**
	 * The pixel value to scroll by.
	 *
	 * @default 40
	 */
	amount?: number;

	/**
	 * Determines whether the scrolling is instant or animates smoothly.
	 *
	 * @default 'auto'
	 */
	behavior?: ScrollBehavior;
}

export interface SpavScrollEvent {
	container: Element;
	direction: SpavDirection;
}

export type SpavScrollCallback = (event: SpavScrollEvent) => void;

export interface SpavScrollIntoViewOptions {
	/**
	 * Defines the horizontal alignment of the element within its scrollable container.
	 *
	 * @default 'nearest'
	 */
	inline?: ScrollLogicalPosition;

	/**
	 * Defines the vertical alignment of the element within its scrollable container.
	 *
	 * @default 'nearest'
	 */
	block?: ScrollLogicalPosition;

	/**
	 * Determines whether the scrolling is instant or animates smoothly.
	 *
	 * @default 'auto'
	 */
	behavior?: ScrollBehavior;
}

export interface SpavScrollIntoViewEvent {
	target: Element;
	container: Element;
}

export type SpavScrollIntoViewCallback = (event: SpavScrollIntoViewEvent) => void;

export interface SpavFocusEvent {
	target: Element;
	origin?: Element;
	direction?: SpavDirection;
}

export type SpavFocusCallback = (event: SpavFocusEvent) => void;

export interface SpavCursorOptions {
	/**
	 * Determines how quickly the cursor animates between targets.
	 * Accepts a value in the range `0` (slowest) to `1` (instant).
	 *
	 * @default 0.25
	 */
	speed?: number;

	/**
	 * The amount of padding added around the cursor in pixels.
	 *
	 * @default 0
	 */
	padding?: number;

	/**
	 * Whether the cursor matches the border radius of its target.
	 *
	 * @default true
	 */
	matchRadius?: boolean;

	/**
	 * Whether to automatically run the `requestAnimationFrame` loop.
	 *
	 * @default true
	 */
	autoRaf?: boolean;
}

export interface SpavCursorApi {
	/**
	 * Determines how quickly the cursor animates between targets.
	 * Accepts a value in the range `0` (slowest) to `1` (instant).
	 */
	speed: number;

	/**
	 * The amount of padding added around the cursor in pixels.
	 */
	padding: number;

	/**
	 * Whether the cursor matches the border radius of its target.
	 */
	matchRadius: boolean;

	/**
	 * Whether to automatically run the `requestAnimationFrame` loop.
	 */
	autoRaf: boolean;

	/**
	 * Advances the cursor by one frame. Must be called every frame when `autoRaf` is disabled.
	 */
	readonly raf: FrameRequestCallback;
}

export interface SpavOptions {
	/**
	 * Configures the visual cursor that tracks the focused element.
	 * Accepts `true` to enable defaults, `false` to disable, or an options object to customize.
	 *
	 * @default true
	 */
	cursor?: boolean | SpavCursorOptions;

	/**
	 * Whether to blur the active element upon pressing the Escape key.
	 *
	 * @default true
	 */
	blurOnEscape?: boolean;

	/**
	 * Configures scroll behavior when no element is reachable in the navigation direction.
	 * Accepts `true` to enable defaults, `false` to disable, an options object to customize,
	 * or a callback for custom logic.
	 *
	 * @default true
	 */
	scroll?: boolean | SpavScrollOptions | SpavScrollCallback;

	/**
	 * Configures how newly focused elements are scrolled into the viewport.
	 * Accepts `true` to enable defaults, `false` to disable, an options object to customize,
	 * or a callback for custom logic.
	 *
	 * @default true
	 */
	scrollIntoView?: boolean | SpavScrollIntoViewOptions | SpavScrollIntoViewCallback;

	/**
	 * Called when the Spav instance focuses an element.
	 *
	 * @default undefined
	 */
	onFocus?: SpavFocusCallback;
}
