export interface HyperellipseOptions {
  /**
   * Принудительно включить фоллбек даже при нативной поддержке
   * corner-shape (для отладки и визуального сравнения).
   */
  force?: boolean;
  /**
   * Множитель border-radius на время, пока фоллбек не применён
   * (сквиркл визуально скругляется слабее круга с тем же радиусом).
   * 0..1, по умолчанию 0.6.
   */
  pendingRadiusScale?: number;
  /**
   * Дополнительные селекторы элементов с corner-shape — escape hatch
   * для cross-origin стайлшитов, которые нельзя просканировать.
   */
  selector?: string;
}

export interface HyperellipseController {
  /** JS-фоллбек активен (браузер без поддержки или force). */
  readonly active: boolean;
  /** Остановить фоллбек и снять все применённые стили. */
  destroy: () => void;
  /** Пересканировать стайлшиты и пересчитать все элементы. */
  refresh: () => void;
  /** Браузер поддерживает corner-shape нативно. */
  readonly supported: boolean;
}
