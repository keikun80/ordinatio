import React from 'react';
import { GitFork } from 'lucide-react';
import { strings } from '../../../constants/strings';

export default function NewRouteModal({
  show,
  onClose,
  newRouteForm,
  setNewRouteForm,
  availableTenants,
  handleCreateRoute
}) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitFork size={18} color="var(--accent-cyan)" />
            <span>{strings.routing.modals.newRouteTitle}</span>
          </div>
        </div>
        <form onSubmit={handleCreateRoute}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">{strings.routing.modals.newRouteNameLabel}</label>
              <input
                className="form-input"
                placeholder={strings.routing.modals.newRouteNamePlaceholder}
                value={newRouteForm.route_name}
                onChange={(e) => setNewRouteForm({ ...newRouteForm, route_name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{strings.routing.modals.newRouteDescLabel}</label>
              <input
                className="form-input"
                placeholder={strings.routing.modals.newRouteDescPlaceholder}
                value={newRouteForm.description}
                onChange={(e) => setNewRouteForm({ ...newRouteForm, description: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">{strings.routing.modals.priorityLabel}</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="form-input"
                  value={newRouteForm.priority}
                  onChange={(e) => setNewRouteForm({ ...newRouteForm, priority: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{strings.routing.modals.matchTenantLabel}</label>
                <select
                  className="form-select"
                  value={newRouteForm.match_tenant}
                  onChange={(e) => setNewRouteForm({ ...newRouteForm, match_tenant: e.target.value })}
                >
                  <option value="">{strings.routing.modals.allTenantsCommon}</option>
                  {availableTenants.map(t => (
                    <option key={t.department_code} value={t.department_code}>
                      {t.name} ({t.department_code})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                  {strings.routing.modals.tenantSelectHint}
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{strings.routing.modals.newRoutePrefixLabel}</label>
              <input
                className="form-input"
                placeholder={strings.routing.modals.newRoutePrefixPlaceholder}
                value={newRouteForm.match_path}
                onChange={(e) => setNewRouteForm({ ...newRouteForm, match_path: e.target.value })}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {strings.common.cancel}
            </button>
            <button type="submit" className="btn btn-primary">
              {strings.routing.modals.btnCreateRouteSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

