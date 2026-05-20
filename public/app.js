import { startApp } from './js/core.js';
import {
  onThemeChange,
  onThemeChangeFromHeader,
  onGlassToggle,
  onGlassToggleFromHeader,
  showPage,
  previewLandingFlow,
  previewLandingFlowFromKey,
  quickActionRefreshJobs,
  quickActionContinueDispatch,
  quickActionStartTracking,
  toggleSidebarCollapse
} from './js/ui-helpers.js';
import {
  openAuth,
  login,
  registerAccount,
  logout,
  toggleReset,
  resetPassword,
  completePasswordRecovery
} from './js/auth.js';
import {
  startDiscourseVerificationFlow,
  confirmIfcCodeAddedThenCheck,
  checkDiscourseVerificationFlow
} from './js/profiles.js';
import {
  loadJobMarket,
  requestJobMarketRefresh,
  acceptJob
} from './js/job-market.js';
import {
  generateDispatch,
  fetchSimBrief,
  dispatchFlight,
  leaveAcceptedJob
} from './js/dispatch.js';
import {
  buyLicense,
  buyTypeRating
} from './js/pilot-shop.js';
import { renderDiagnosticsPage } from './js/admin.js';

window.onThemeChange = onThemeChange;
window.onThemeChangeFromHeader = onThemeChangeFromHeader;
window.onGlassToggle = onGlassToggle;
window.onGlassToggleFromHeader = onGlassToggleFromHeader;
window.openAuth = openAuth;
window.showPage = showPage;
window.previewLandingFlow = previewLandingFlow;
window.previewLandingFlowFromKey = previewLandingFlowFromKey;
window.login = login;
window.registerAccount = registerAccount;
window.logout = logout;
window.toggleReset = toggleReset;
window.resetPassword = resetPassword;
window.completePasswordRecovery = completePasswordRecovery;
window.fetchSimBrief = fetchSimBrief;
window.dispatchFlight = dispatchFlight;
window.leaveAcceptedJob = leaveAcceptedJob;
window.loadJobMarket = loadJobMarket;
window.requestJobMarketRefresh = requestJobMarketRefresh;
window.acceptJob = acceptJob;
window.generateDispatch = generateDispatch;
window.buyLicense = buyLicense;
window.buyTypeRating = buyTypeRating;
window.startDiscourseVerificationFlow = startDiscourseVerificationFlow;
window.confirmIfcCodeAddedThenCheck = confirmIfcCodeAddedThenCheck;
window.checkDiscourseVerificationFlow = checkDiscourseVerificationFlow;
window.renderDiagnosticsPage = renderDiagnosticsPage;
window.quickActionRefreshJobs = quickActionRefreshJobs;
window.quickActionContinueDispatch = quickActionContinueDispatch;
window.quickActionStartTracking = quickActionStartTracking;
window.toggleSidebarCollapse = toggleSidebarCollapse;

window.addEventListener('load', startApp);
