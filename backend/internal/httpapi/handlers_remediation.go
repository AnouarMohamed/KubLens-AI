package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"kubelens-backend/internal/auth"
	"kubelens-backend/internal/model"
	"kubelens-backend/internal/remediation"
)

func (s *Server) handleProposeRemediation(w http.ResponseWriter, r *http.Request) {
	if s.remediations == nil {
		writeError(w, http.StatusServiceUnavailable, "remediation store is not configured")
		return
	}

	pods, nodes := s.cluster.Snapshot(r.Context())
	diag := s.mapDiagnosticsReport(s.runDiagnostics(r.Context()))
	proposals := remediation.ProposeFromDiagnostics(diag, pods, nodes)
	for i := range proposals {
		s.associateProposalWithOpenIncident(&proposals[i])
	}
	saved := s.remediations.SaveProposals(proposals)
	for _, proposal := range saved {
		if strings.TrimSpace(proposal.IncidentID) != "" && s.incidents != nil {
			_ = s.incidents.AssociateRemediation(proposal.IncidentID, proposal.ID)
		}
	}

	for _, proposal := range saved {
		proposalCopy := proposal
		s.notifyChatOps(func(ctx context.Context) {
			if s.chatops != nil {
				s.chatops.NotifyRemediation(ctx, proposalCopy)
			}
		})
	}

	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleListRemediation(w http.ResponseWriter, _ *http.Request) {
	if s.remediations == nil {
		writeJSON(w, http.StatusOK, []model.RemediationProposal{})
		return
	}
	writeJSON(w, http.StatusOK, s.remediations.List())
}

func (s *Server) handleApproveRemediation(w http.ResponseWriter, r *http.Request) {
	if s.remediations == nil {
		writeError(w, http.StatusServiceUnavailable, "remediation store is not configured")
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	principal, _ := auth.PrincipalFromContext(r.Context())
	updated, err := s.remediations.Approve(id, principal.User)
	if err != nil {
		if errors.Is(err, remediation.ErrProposalNotFound) {
			writeError(w, http.StatusNotFound, "remediation proposal not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleExecuteRemediation(w http.ResponseWriter, r *http.Request) {
	if s.remediations == nil {
		writeError(w, http.StatusServiceUnavailable, "remediation store is not configured")
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	proposal, ok := s.remediations.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "remediation proposal not found")
		return
	}
	if strings.TrimSpace(proposal.Status) != "approved" {
		writeError(w, http.StatusBadRequest, "proposal must be approved before execution")
		return
	}

	principal, _ := auth.PrincipalFromContext(r.Context())
	executor := strings.TrimSpace(principal.User)
	approver := strings.TrimSpace(proposal.ApprovedBy)

	if strings.EqualFold(strings.TrimSpace(s.runtime.Mode), "prod") && approver != "" && executor != "" && approver == executor {
		writeError(w, http.StatusForbidden, "four-eyes enforcement: the approver and executor must be different users")
		return
	}
	if !strings.EqualFold(strings.TrimSpace(s.runtime.Mode), "prod") && approver != "" && executor != "" && approver == executor {
		s.logger.Warn("four-eyes bypassed in non-prod mode",
			"mode", s.runtime.Mode,
			"proposal_id", proposal.ID,
			"user", executor,
		)
	}

	result, err := remediation.Execute(r.Context(), proposal, s.cluster)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	executed, err := s.remediations.MarkExecuted(proposal.ID, executor, result)
	if err != nil {
		if errors.Is(err, remediation.ErrProposalNotFound) {
			writeError(w, http.StatusNotFound, "remediation proposal not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.associateExecutedProposalWithIncidents(executed)
	s.notifyChatOps(func(ctx context.Context) {
		if s.chatops != nil {
			s.chatops.NotifyRemediation(ctx, executed)
		}
	})

	writeJSON(w, http.StatusOK, executed)
}

func (s *Server) handleRejectRemediation(w http.ResponseWriter, r *http.Request) {
	if s.remediations == nil {
		writeError(w, http.StatusServiceUnavailable, "remediation store is not configured")
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	var req model.RemediationRejectRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	principal, _ := auth.PrincipalFromContext(r.Context())
	updated, err := s.remediations.Reject(id, principal.User, req.Reason)
	if err != nil {
		if errors.Is(err, remediation.ErrProposalNotFound) {
			writeError(w, http.StatusNotFound, "remediation proposal not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) associateExecutedProposalWithIncidents(proposal model.RemediationProposal) {
	if s.incidents == nil {
		return
	}

	resourceKey := strings.TrimSpace(proposal.Resource)
	if strings.TrimSpace(proposal.Namespace) != "" {
		resourceKey = proposal.Namespace + "/" + proposal.Resource
	}
	needle := strings.ToLower(strings.TrimSpace(resourceKey))
	if needle == "" {
		return
	}

	for _, incidentItem := range s.incidents.List() {
		for _, affected := range incidentItem.AffectedResources {
			if strings.ToLower(strings.TrimSpace(affected)) == needle {
				_ = s.incidents.AssociateRemediation(incidentItem.ID, proposal.ID)
				break
			}
		}
	}
}

func (s *Server) associateProposalWithOpenIncident(proposal *model.RemediationProposal) {
	if proposal == nil || s.incidents == nil {
		return
	}

	resourceKey := strings.TrimSpace(proposal.Resource)
	if strings.TrimSpace(proposal.Namespace) != "" {
		resourceKey = proposal.Namespace + "/" + proposal.Resource
	}
	needle := strings.ToLower(strings.TrimSpace(resourceKey))
	if needle == "" {
		return
	}

	for _, incidentItem := range s.incidents.List() {
		if incidentItem.Status != model.IncidentStatusOpen {
			continue
		}
		for _, affected := range incidentItem.AffectedResources {
			if strings.ToLower(strings.TrimSpace(affected)) == needle {
				proposal.IncidentID = incidentItem.ID
				return
			}
		}
	}
}
