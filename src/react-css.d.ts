import "react";

declare module "react" {
  /** Allows CSS custom properties, such as `--heat`, in the `style` prop. */
  // Module augmentation must merge into the existing interface, so a Record type cannot work here.
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
