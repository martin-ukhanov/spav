# Spav

**Spatial Navigation for the Modern Web**

Spav allows users to move focus around a website using the arrow keys. It sits on top of native browser behavior: press an arrow key and focus jumps to the nearest focusable element in that direction, falling back to scrolling the page (or the nearest nested scroll container) when nothing focusable is in view. It also ships with an optional animated visual indicator that smoothly follows the focused element.

- **Directional Focus Movement** — Arrow keys move focus to the best candidate in the pressed direction, using a weighted distance heuristic that favors aligned, nearby elements.
- **Scroll Fallback** — When no focusable element is reachable, Spav scrolls the page or the relevant scroll container instead, so nothing is ever out of reach.
- **Animated Indicator** — An unstyled overlay element that animates between focus targets.
- **Native-First** — Works with regular focusable elements (`button`, `a[href]`, inputs, `tabindex`, …) and respects `inert`, `disabled`, and visibility.
- **Zero Dependencies** — A single class, written in TypeScript.

## Installation

```bash
npm install spav-js
```

## Setup

Create an instance and Spav immediately starts listening for arrow keys:

```ts
import { Spav } from 'spav-js';

const spav = new Spav();
```

The indicator element is created with no visual styling of its own. Style it through the `data-spav-indicator` attribute:

```css
[data-spav-indicator] {
	background-color: color-mix(in srgb, royalblue, transparent 85%);
	border: 2px solid royalblue;
}
```

When you no longer need the instance, clean it up:

```ts
spav.destroy();
```

All constructor options are also exposed as mutable properties, so they can be changed at runtime:

```ts
spav.blurOnEscape = false;
spav.scroll = { behavior: 'smooth' };
spav.indicator = { speed: 0.5 };
```

## Spav Options

| Option           | Type                                                                 | Default     | Description                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `indicator`      | `boolean \| SpavIndicatorOptions`                                    | `true`      | Configures the visual indicator that tracks the focused element. Accepts `true` to enable defaults, `false` to disable, or an options object to customize.                                                  |
| `blurOnEscape`   | `boolean`                                                            | `true`      | Whether to blur the active element upon pressing the Escape key.                                                                                                                                            |
| `scroll`         | `boolean \| SpavScrollOptions \| SpavScrollCallback`                 | `true`      | Configures scroll behavior when no element is reachable in the navigation direction. Accepts `true` to enable defaults, `false` to disable, an options object to customize, or a callback for custom logic. |
| `scrollIntoView` | `boolean \| SpavScrollIntoViewOptions \| SpavScrollIntoViewCallback` | `true`      | Configures how newly focused elements are scrolled into the viewport. Accepts `true` to enable defaults, `false` to disable, an options object to customize, or a callback for custom logic.                |
| `onFocus`        | `SpavFocusCallback`                                                  | `undefined` | Called when the Spav instance focuses an element.                                                                                                                                                           |

### `SpavScrollOptions`

| Option     | Type             | Default  | Description                                                       |
| ---------- | ---------------- | -------- | ----------------------------------------------------------------- |
| `amount`   | `number`         | `40`     | The pixel value to scroll by.                                     |
| `behavior` | `ScrollBehavior` | `'auto'` | Determines whether the scrolling is instant or animates smoothly. |

### `SpavScrollIntoViewOptions`

| Option     | Type                    | Default     | Description                                                                      |
| ---------- | ----------------------- | ----------- | -------------------------------------------------------------------------------- |
| `inline`   | `ScrollLogicalPosition` | `'nearest'` | Defines the horizontal alignment of the element within its scrollable container. |
| `block`    | `ScrollLogicalPosition` | `'nearest'` | Defines the vertical alignment of the element within its scrollable container.   |
| `behavior` | `ScrollBehavior`        | `'auto'`    | Determines whether the scrolling is instant or animates smoothly.                |

## Indicator Options

| Option              | Type      | Default | Description                                                                                                                 |
| ------------------- | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `speed`             | `number`  | `0.25`  | Determines how quickly the indicator animates between targets. Accepts a value in the range `0` (slowest) to `1` (instant). |
| `padding`           | `number`  | `0`     | The amount of padding added around the indicator in pixels.                                                                 |
| `matchBorderRadius` | `boolean` | `true`  | Whether the indicator matches the border radius of its target.                                                              |
| `autoRaf`           | `boolean` | `true`  | Whether to automatically run the `requestAnimationFrame` loop.                                                              |

Reading `spav.indicator` returns the live indicator API (or `undefined` when the indicator is disabled). Its `speed`, `padding`, `matchBorderRadius`, and `autoRaf` properties can be tweaked in place, and it exposes a read-only `raf` callback (see [Custom RAF loop](#custom-raf-loop)):

```ts
if (spav.indicator) spav.indicator.speed = 0.4;
```

## Methods

| Method                | Arguments                                        | Description                                                                                                                                                       |
| --------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigate(direction)` | `direction: 'left' \| 'right' \| 'up' \| 'down'` | Performs spatial navigation in the specified direction. Finds the best element to focus, or scrolls the nearest container if no element is immediately reachable. |
| `focus(target)`       | `target: Element`                                | Attempts to focus a target element. Returns `true` if the target element was successfully focused, `false` otherwise.                                             |
| `destroy()`           | —                                                | Cleans up the instance and removes all event listeners.                                                                                                           |

## Custom RAF Loop

By default the indicator runs its own `requestAnimationFrame` loop, starting and stopping it as needed. If your app already drives a frame loop (e.g. alongside a smooth-scroll library, GSAP ticker, or WebGL renderer), disable `autoRaf` and advance the indicator yourself by calling `raf` every frame with the current time:

```ts
import { Spav } from 'spav-js';

const spav = new Spav({ indicator: { autoRaf: false } });

function frame(time: number) {
	spav.indicator?.raf(time);
	requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

## Data Attributes

| Attribute             | Effect                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-spav-contain`   | Marks an element as a spatial navigation container. Candidates are searched container by container, so this scopes navigation to the group first before escaping to the rest of the page. Scroll containers and the document root are containers automatically. |
| `data-spav-ignore`    | Excludes the element and all of its descendants from spatial navigation.                                                                                                                                                                                        |
| `data-spav-indicator` | Set by Spav on the indicator element. Use the `[data-spav-indicator]` selector as your styling hook.                                                                                                                                                            |

## License

MIT
