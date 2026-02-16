#!/bin/bash
# ─── start-ngrok.sh ───
# Conecta ngrok (rodando no WSL) ao servidor Next.js (rodando no Windows)
# O truque: WSL2 tem um IP diferente de Windows, então "localhost" não funciona.
# Precisamos pegar o IP do Windows host.

WINDOWS_HOST=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}')
PORT=${1:-3001}

echo "╔══════════════════════════════════════════════╗"
echo "║  🔗 Iniciando ngrok (WSL → Windows)         ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Windows Host IP: $WINDOWS_HOST"
echo "║  Porta destino:   $PORT"
echo "║  Forwarding:      http://$WINDOWS_HOST:$PORT"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Após iniciar, copie a URL https://...ngrok-free.app"
echo "e cole no Painel Meta como:"
echo "  https://xxxx.ngrok-free.app/api/webhook"
echo ""

ngrok http $WINDOWS_HOST:$PORT
