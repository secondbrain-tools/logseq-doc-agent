export { FrontendStyleInjector } from './style-injector';
export { FrontendComponentInjector } from './component-injector';
export { FrontendRatingCalculator } from './rating-calculator';
export { FrontendSidebarInjector } from './sidebar-injector';

// Re-export use cases that depend on frontend infrastructure
export { InjectRatingsUseCase } from '../../application/usecases/inject-ratings.usecase';
export { AddToSidebarUseCase } from '../../application/usecases/add-to-sidebar.usecase';
