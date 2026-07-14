export type MoviePosterActionResult =
  | { status: 'chosen' }
  | { status: 'cleared' }
  | { status: 'cancelled' }
  | { status: 'error'; action: 'choose' | 'clear' }
