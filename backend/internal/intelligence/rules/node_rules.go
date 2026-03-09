package rules

import "strings"

import "kubelens-backend/internal/state"

func IsNodeNotReady(node state.NodeInfo) bool {
	return strings.EqualFold(node.Status, "NotReady")
}

func NodeHasPressure(node state.NodeInfo, condition string) bool {
	for _, cond := range node.Conditions {
		if strings.EqualFold(cond.Type, condition) && strings.EqualFold(cond.Status, "True") {
			return true
		}
	}
	return false
}
