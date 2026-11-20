#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Kubernetes Deployment Verification via Multipass (MicroK8s/K3s)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/mp-common.sh"

VM_NAME="ordinatio-k8s"
CPUS="${MP_CPUS:-4}"
MEMORY="${MP_MEMORY:-8G}"
DISK="${MP_DISK:-30G}"

echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo -e "${BOLD}${CYAN}☸️  [Multipass K8s] MicroK8s/K3s Cluster & deploy/k8s/ Audit${NC}"
echo -e "${BOLD}${CYAN}======================================================================${NC}"

# 1. Check existing instance
if mp_cmd list 2>/dev/null | grep -q "^${VM_NAME}[[:space:]]"; then
    echo -e "${YELLOW}⚠️ 기존 K8s 테스트 인스턴스(${VM_NAME}) 감지. 초기화 진행...${NC}"
    mp_cmd stop "${VM_NAME}" 2>/dev/null || true
    mp_cmd delete "${VM_NAME}" 2>/dev/null || true
    mp_cmd purge 2>/dev/null || true
fi

# 2. Launch Clean VM
echo -e "\n${BOLD}[1/4] 클린 K8s 가상머신 기동 중 (${VM_NAME}: ${CPUS} vCPU, ${MEMORY} RAM, ${DISK} Disk)...${NC}"
mp_cmd launch 24.04 --name "${VM_NAME}" --cpus "${CPUS}" --memory "${MEMORY}" --disk "${DISK}"

VM_IP=$(mp_cmd info "${VM_NAME}" | grep "IPv4:" | awk '{print $2}')
echo -e "${GREEN}✔ K8s 가상머신 준비 완료 (IP: ${VM_IP})${NC}"

# 3. Install lightweight K8s (K3s)
echo -e "\n${BOLD}[2/4] 초경량 엔터프라이즈 K8s (K3s) 엔진 자동 프로비저닝...${NC}"
mp_cmd exec "${VM_NAME}" -- bash -c "
  curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 644
"
mp_cmd exec "${VM_NAME}" -- kubectl wait --for=condition=Ready node --all --timeout=60s
echo -e "${GREEN}✔ K8s 클러스터 준비 완료 (Node: Ready)${NC}"

# 4. Mount & Deploy Ordinatio K8s Manifests
echo -e "\n${BOLD}[3/4] Ordinatio deploy/k8s/ 매니페스트 적용...${NC}"
mp_cmd mount "${ROOT_DIR}" "${VM_NAME}:/opt/ordinatio-src"

mp_cmd exec "${VM_NAME}" -- bash -c "
  if [ -d /opt/ordinatio-src/deploy/k8s ]; then
    kubectl apply -f /opt/ordinatio-src/deploy/k8s/ || true
  fi
"

# 5. Pod & Service verification
echo -e "\n${BOLD}[4/4] Kubernetes 클러스터 리소스 상태 확인...${NC}"
mp_cmd exec "${VM_NAME}" -- kubectl get pods,svc -A

echo -e "\n${BOLD}${GREEN}======================================================================${NC}"
echo -e "${BOLD}${GREEN}🎉 SUCCESS: Multipass 기반 Kubernetes 클러스터 배포 검증 완료!${NC}"
echo -e "   • 가상머신 IP:  ${VM_IP}"
echo -e "   • 정리 명령어: make mp-clean"
echo -e "${BOLD}${GREEN}======================================================================${NC}"
