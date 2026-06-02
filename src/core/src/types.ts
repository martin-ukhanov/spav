export type FocusableElement = HTMLElement | SVGElement | MathMLElement;

export type SpavDirection = 'left' | 'right' | 'up' | 'down';

export interface SpavOrigin {
	element?: Element;
	rect: DOMRect;
}

export interface SpavScrollOptions {
	amount?: number;
	behavior?: ScrollOptions['behavior'];
}

export interface SpavScrollEvent {
	container: Element;
	direction: SpavDirection;
}

export type SpavScrollCallback = (event: SpavScrollEvent) => void;

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
	focusVisible?: boolean;
	scroll?: boolean | SpavScrollOptions | SpavScrollCallback;
	scrollIntoView?: boolean | ScrollIntoViewOptions | SpavScrollIntoViewCallback;
	onFocus?: SpavFocusCallback;
}
