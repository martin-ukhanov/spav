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

export interface SpavOptions {
	/**
	 * Whether to blur the active element upon pressing the Escape key.
	 *
	 * @default true
	 */
	blurOnEscape?: boolean;

	/**
	 * Configures scroll behavior when no element is reachable in the navigation direction.
	 * Accepts `true` to enable default behavior, `false` to disable, an options object to customize,
	 * or a callback for custom logic.
	 *
	 * @default true
	 */
	scroll?: boolean | SpavScrollOptions | SpavScrollCallback;

	/**
	 * Configures how newly focused elements are scrolled into the viewport.
	 * Accepts `true` to enable default behavior, `false` to disable, an options object
	 * to customize, or a callback for custom logic.
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

export interface SpavCursorOptions {
	padding?: number;
	matchRadius?: boolean;
}
