/**
 * Frontend-specific infrastructure implementations
 */

export { FrontendStyleInjector } from './style-injector';
export { FrontendComponentInjector } from './component-injector';
export { FrontendRatingCalculator } from './rating-calculator';

// Re-export use cases that depend on frontend infrastructure
export { InjectRatingsUseCase } from '../../application/usecases/inject-ratings.usecase';
