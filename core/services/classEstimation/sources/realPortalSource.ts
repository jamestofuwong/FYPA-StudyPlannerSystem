// ============================================================
// The live CampusNexus portal, behind the PortalSource contract. A thin wrapper over
// portalSessionService: no behaviour of its own, so the portal path works exactly as it did before the
// contract existed.
// ============================================================

import {
  getStatus,
  getStudents,
  fetchEnrollments,
  fetchDegreeAudit,
} from '../../portal/portalSessionService';
import type { PortalSource } from './portalSource';

export const realPortalSource: PortalSource = {
  id: 'portal',
  label: 'Live portal',
  requiresLogin: true,

  async readiness() {
    const status = getStatus();
    if (status.sessionStatus !== 'logged-in') {
      return { ready: false, reason: 'Not logged in to the portal. Use the login button in the top bar first.' };
    }
    if (status.studentCount === 0) {
      return { ready: false, reason: 'Logged in, but no students have been loaded from the portal yet.' };
    }
    return { ready: true };
  },

  async getStudents() {
    return getStudents();
  },

  fetchEnrollments,
  fetchDegreeAudit,
};
