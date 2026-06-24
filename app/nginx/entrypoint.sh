#!/bin/sh
set -e

sed -e "s|\${DOMAIN}|$DOMAIN|g" -e "s|\${APP_PORT}|$APP_PORT|g" \
  /etc/nginx/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf

# Si no existe el certificado real, crea uno auto-firmado para que nginx pueda
# arrancar. Certbot lo reemplazará con el cert real de Let's Encrypt.
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  mkdir -p "/etc/letsencrypt/live/${DOMAIN}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" \
    -out    "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" \
    -subj   '/CN=localhost' 2>/dev/null
fi

# Recarga el certificado cada 6h para que el renew de certbot tenga efecto.
(while :; do sleep 6h; nginx -s reload 2>/dev/null || true; done) &

exec nginx -g 'daemon off;'
