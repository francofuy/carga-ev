export type ScreenId = 'inicio' | 'cargas' | 'vehiculo' | 'ajustes';

export interface Screen {
  id: ScreenId;
  render(): string;
  /** Called after the screen's HTML is in the DOM, to wire event listeners. */
  mount?(root: HTMLElement): void;
}
