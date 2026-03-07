package cluster

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"sigs.k8s.io/yaml"

	"kubelens-backend/internal/model"
)

const restartedAtAnnotation = "kubectl.kubernetes.io/restartedAt"

var errUnsupportedWorkloadKind = errors.New("unsupported workload kind")

func (s *Service) GetResourceYAML(ctx context.Context, kind, namespace, name string) (string, error) {
	if s.inMockMode() {
		return s.mockGetResourceYAML(kind, namespace, name)
	}

	kind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return "", err
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	switch kind {
	case "deployments":
		obj, err := s.client.AppsV1().Deployments(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return "", toActionError(err, "read deployment")
		}
		return marshalYAML(obj)
	case "statefulsets":
		obj, err := s.client.AppsV1().StatefulSets(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return "", toActionError(err, "read statefulset")
		}
		return marshalYAML(obj)
	case "jobs":
		obj, err := s.client.BatchV1().Jobs(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return "", toActionError(err, "read job")
		}
		return marshalYAML(obj)
	default:
		return "", errUnsupportedWorkloadKind
	}
}

func (s *Service) ApplyResourceYAML(ctx context.Context, kind, namespace, name, manifestYAML string) (model.ActionResult, error) {
	if strings.TrimSpace(manifestYAML) == "" {
		return model.ActionResult{}, errors.New("yaml content is required")
	}

	if s.inMockMode() {
		return s.mockApplyResourceYAML(kind, namespace, name, manifestYAML)
	}

	kind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	switch kind {
	case "deployments":
		current, err := s.client.AppsV1().Deployments(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read deployment")
		}

		desired := &appsv1.Deployment{}
		if err := yaml.Unmarshal([]byte(manifestYAML), desired); err != nil {
			return model.ActionResult{}, fmt.Errorf("decode deployment yaml: %w", err)
		}

		prepareMetadataForUpdate(&desired.ObjectMeta, current.ObjectMeta, namespace, name)
		desired.Status = appsv1.DeploymentStatus{}

		if _, err := s.client.AppsV1().Deployments(namespace).Update(callCtx, desired, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "update deployment")
		}
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Updated deployment %s/%s", namespace, name)}, nil
	case "statefulsets":
		current, err := s.client.AppsV1().StatefulSets(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read statefulset")
		}

		desired := &appsv1.StatefulSet{}
		if err := yaml.Unmarshal([]byte(manifestYAML), desired); err != nil {
			return model.ActionResult{}, fmt.Errorf("decode statefulset yaml: %w", err)
		}

		prepareMetadataForUpdate(&desired.ObjectMeta, current.ObjectMeta, namespace, name)
		desired.Status = appsv1.StatefulSetStatus{}

		if _, err := s.client.AppsV1().StatefulSets(namespace).Update(callCtx, desired, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "update statefulset")
		}
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Updated statefulset %s/%s", namespace, name)}, nil
	case "jobs":
		current, err := s.client.BatchV1().Jobs(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read job")
		}

		desired := &batchv1.Job{}
		if err := yaml.Unmarshal([]byte(manifestYAML), desired); err != nil {
			return model.ActionResult{}, fmt.Errorf("decode job yaml: %w", err)
		}

		prepareMetadataForUpdate(&desired.ObjectMeta, current.ObjectMeta, namespace, name)
		desired.Status = batchv1.JobStatus{}

		if _, err := s.client.BatchV1().Jobs(namespace).Update(callCtx, desired, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "update job")
		}
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Updated job %s/%s", namespace, name)}, nil
	default:
		return model.ActionResult{}, errUnsupportedWorkloadKind
	}
}

func (s *Service) ScaleResource(ctx context.Context, kind, namespace, name string, replicas int32) (model.ActionResult, error) {
	if replicas < 0 {
		return model.ActionResult{}, errors.New("replicas must be >= 0")
	}

	if s.inMockMode() {
		return s.mockScaleResource(kind, namespace, name, replicas)
	}

	kind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	switch kind {
	case "deployments":
		scale, err := s.client.AppsV1().Deployments(namespace).GetScale(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read deployment scale")
		}
		scale.Spec.Replicas = replicas
		if _, err := s.client.AppsV1().Deployments(namespace).UpdateScale(callCtx, name, scale, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "update deployment scale")
		}
	case "statefulsets":
		scale, err := s.client.AppsV1().StatefulSets(namespace).GetScale(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read statefulset scale")
		}
		scale.Spec.Replicas = replicas
		if _, err := s.client.AppsV1().StatefulSets(namespace).UpdateScale(callCtx, name, scale, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "update statefulset scale")
		}
	case "jobs":
		job, err := s.client.BatchV1().Jobs(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read job")
		}
		job.Spec.Parallelism = int32Ptr(replicas)
		if job.Spec.Completions != nil && *job.Spec.Completions < replicas {
			job.Spec.Completions = int32Ptr(replicas)
		}
		if _, err := s.client.BatchV1().Jobs(namespace).Update(callCtx, job, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "update job scale")
		}
	default:
		return model.ActionResult{}, errUnsupportedWorkloadKind
	}

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Scaled %s %s/%s to %d", kind, namespace, name, replicas)}, nil
}

func (s *Service) RestartResource(ctx context.Context, kind, namespace, name string) (model.ActionResult, error) {
	if s.inMockMode() {
		return s.mockRestartResource(kind, namespace, name)
	}

	kind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	restartedAt := time.Now().UTC().Format(time.RFC3339)

	switch kind {
	case "deployments":
		obj, err := s.client.AppsV1().Deployments(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read deployment")
		}
		if obj.Spec.Template.Annotations == nil {
			obj.Spec.Template.Annotations = map[string]string{}
		}
		obj.Spec.Template.Annotations[restartedAtAnnotation] = restartedAt
		if _, err := s.client.AppsV1().Deployments(namespace).Update(callCtx, obj, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "restart deployment")
		}
	case "statefulsets":
		obj, err := s.client.AppsV1().StatefulSets(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read statefulset")
		}
		if obj.Spec.Template.Annotations == nil {
			obj.Spec.Template.Annotations = map[string]string{}
		}
		obj.Spec.Template.Annotations[restartedAtAnnotation] = restartedAt
		if _, err := s.client.AppsV1().StatefulSets(namespace).Update(callCtx, obj, metav1.UpdateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "restart statefulset")
		}
	case "jobs":
		job, err := s.client.BatchV1().Jobs(namespace).Get(callCtx, name, metav1.GetOptions{})
		if err != nil {
			return model.ActionResult{}, toActionError(err, "read job")
		}

		rerunName := buildRerunJobName(job.Name)
		rerun := &batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{
				Name:        rerunName,
				Namespace:   namespace,
				Labels:      copyStringMap(job.Labels),
				Annotations: copyStringMap(job.Annotations),
			},
			Spec: *job.Spec.DeepCopy(),
		}
		if rerun.Spec.Template.Labels == nil {
			rerun.Spec.Template.Labels = map[string]string{}
		}
		rerun.Spec.Template.Labels["kubelens.io/rerun-for"] = job.Name
		if _, err := s.client.BatchV1().Jobs(namespace).Create(callCtx, rerun, metav1.CreateOptions{}); err != nil {
			return model.ActionResult{}, toActionError(err, "rerun job")
		}
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Created rerun job %s/%s", namespace, rerunName)}, nil
	default:
		return model.ActionResult{}, errUnsupportedWorkloadKind
	}

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Restart triggered for %s %s/%s", kind, namespace, name)}, nil
}

func (s *Service) RollbackResource(ctx context.Context, kind, namespace, name string) (model.ActionResult, error) {
	if s.inMockMode() {
		return s.mockRollbackResource(kind, namespace, name)
	}

	kind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}
	if kind != "deployments" {
		return model.ActionResult{}, errors.New("rollback is currently supported for deployments only")
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	deployment, err := s.client.AppsV1().Deployments(namespace).Get(callCtx, name, metav1.GetOptions{})
	if err != nil {
		return model.ActionResult{}, toActionError(err, "read deployment")
	}

	selector, err := metav1.LabelSelectorAsSelector(deployment.Spec.Selector)
	if err != nil {
		return model.ActionResult{}, fmt.Errorf("deployment selector is invalid: %w", err)
	}

	rsList, err := s.client.AppsV1().ReplicaSets(namespace).List(callCtx, metav1.ListOptions{LabelSelector: selector.String()})
	if err != nil {
		return model.ActionResult{}, fmt.Errorf("list replicasets: %w", err)
	}

	revisions := collectDeploymentRevisions(deployment, rsList.Items)
	if len(revisions) < 2 {
		return model.ActionResult{}, errors.New("no previous revision found for rollback")
	}

	currentRevision := deploymentRevision(deployment.ObjectMeta)
	target := chooseRollbackTarget(revisions, currentRevision)
	if target == nil {
		return model.ActionResult{}, errors.New("no rollback target revision available")
	}

	deployment.Spec.Template = *target.ReplicaSet.Spec.Template.DeepCopy()
	if deployment.Annotations == nil {
		deployment.Annotations = map[string]string{}
	}
	deployment.Annotations["kubelens.io/rollback-to-revision"] = strconv.Itoa(target.Revision)
	if _, err := s.client.AppsV1().Deployments(namespace).Update(callCtx, deployment, metav1.UpdateOptions{}); err != nil {
		return model.ActionResult{}, toActionError(err, "rollback deployment")
	}

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Rolled back deployment %s/%s to revision %d", namespace, name, target.Revision)}, nil
}

func normalizeWorkloadKind(kind string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "deployment", "deployments":
		return "deployments", nil
	case "statefulset", "statefulsets":
		return "statefulsets", nil
	case "job", "jobs":
		return "jobs", nil
	default:
		return "", fmt.Errorf("%w: %s", errUnsupportedWorkloadKind, kind)
	}
}

func marshalYAML(value any) (string, error) {
	raw, err := yaml.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("marshal yaml: %w", err)
	}
	return string(raw), nil
}

func prepareMetadataForUpdate(target *metav1.ObjectMeta, current metav1.ObjectMeta, namespace, name string) {
	target.Name = name
	target.Namespace = namespace
	target.ResourceVersion = current.ResourceVersion
	target.UID = current.UID
	target.CreationTimestamp = current.CreationTimestamp
	target.ManagedFields = current.ManagedFields
}

func toActionError(err error, action string) error {
	if apierrors.IsNotFound(err) {
		return ErrNotFound
	}
	return fmt.Errorf("%s: %w", action, err)
}

func int32Ptr(value int32) *int32 {
	return &value
}

func buildRerunJobName(base string) string {
	suffix := fmt.Sprintf("-rerun-%d", time.Now().Unix())
	limit := 63 - len(suffix)
	if limit < 1 {
		return fmt.Sprintf("job%s", suffix)
	}
	if len(base) > limit {
		base = strings.TrimRight(base[:limit], "-")
		if base == "" {
			base = "job"
		}
	}
	return base + suffix
}

func copyStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]string, len(values))
	for k, v := range values {
		out[k] = v
	}
	return out
}

type deploymentRevisionItem struct {
	Revision   int
	ReplicaSet appsv1.ReplicaSet
}

func collectDeploymentRevisions(deployment *appsv1.Deployment, replicaSets []appsv1.ReplicaSet) []deploymentRevisionItem {
	items := make([]deploymentRevisionItem, 0, len(replicaSets))
	for _, replicaSet := range replicaSets {
		if !ownedByDeployment(deployment, replicaSet) {
			continue
		}
		rev := deploymentRevision(replicaSet.ObjectMeta)
		if rev <= 0 {
			continue
		}
		items = append(items, deploymentRevisionItem{Revision: rev, ReplicaSet: replicaSet})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Revision > items[j].Revision
	})
	return items
}

func chooseRollbackTarget(revisions []deploymentRevisionItem, currentRevision int) *deploymentRevisionItem {
	if len(revisions) == 0 {
		return nil
	}

	if currentRevision > 0 {
		for i := range revisions {
			if revisions[i].Revision < currentRevision {
				return &revisions[i]
			}
		}
	}

	if len(revisions) > 1 {
		return &revisions[1]
	}
	return nil
}

func deploymentRevision(meta metav1.ObjectMeta) int {
	if meta.Annotations == nil {
		return 0
	}
	raw, ok := meta.Annotations["deployment.kubernetes.io/revision"]
	if !ok {
		return 0
	}
	rev, err := strconv.Atoi(raw)
	if err != nil {
		return 0
	}
	return rev
}

func ownedByDeployment(deployment *appsv1.Deployment, replicaSet appsv1.ReplicaSet) bool {
	for _, ref := range replicaSet.OwnerReferences {
		if ref.Kind == "Deployment" && ref.UID == deployment.UID {
			return true
		}
	}

	selector, err := metav1.LabelSelectorAsSelector(deployment.Spec.Selector)
	if err != nil {
		return false
	}
	return selector.Matches(labels.Set(replicaSet.Labels))
}
