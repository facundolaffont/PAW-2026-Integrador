# Deployment

## Infraestructura en Google Cloud Platform

Se creó una máquina virtual en **Google Compute Engine** (GCP) con sistema operativo Debian. Se reservó una **IP estática externa** y se asignó a la instancia para garantizar que la dirección no cambie entre reinicios. Se configuraron las reglas de firewall para permitir tráfico HTTP (puerto 80) y HTTPS (puerto 443).

## Contenedores Docker

La aplicación se ejecuta mediante **Docker Compose** con cuatro servicios:

- **app**: servidor Node.js/Express
- **mysql**: base de datos MySQL 8
- **nginx**: reverse proxy que termina TLS y redirige HTTP → HTTPS (perfil `https`)
- **certbot**: obtiene y renueva certificados Let's Encrypt automáticamente (perfil `https`)

El código fuente se monta como volumen en el container de la aplicación, lo que permite actualizar el código sin necesidad de reconstruir la imagen Docker en cada deploy.

Los servicios `nginx` y `certbot` pertenecen al perfil `https` y sólo corren en producción. Para desarrollo local se usa `docker compose up` sin perfil (levanta sólo `app` y `mysql`).

## Dominio y TLS

Se configuró un subdominio gratuito mediante **Duck DNS**, apuntando a la IP estática de la VM. Los certificados TLS son provistos por **Let's Encrypt** y se renuevan automáticamente por el container `certbot` cada 12 horas.

El tráfico WebSocket (`ws://`) también pasa por nginx y queda cifrado como `wss://`.

## Configuración inicial de HTTPS (one-time)

Ejecutar **una sola vez** en la VM, luego del primer `git pull`:

```bash
# 1. Abrir el puerto 443 en GCP Firewall (si no está abierto).
# 2. Agregar DOMAIN y CERTBOT_EMAIL al .env de la VM.
cd /home/rrobles/PAW-2026-Integrador/app
bash init-letsencrypt.sh
```

El script crea un certificado dummy, inicia nginx, obtiene el cert real de Let's Encrypt y recarga nginx. Los certificados quedan en el volumen Docker `certbot_certs` y se renuevan automáticamente.

## Secrets en GitHub Actions

Las credenciales sensibles se almacenaron como **secrets en el repositorio de GitHub**:

| Secret            | Descripción                                 |
| ----------------- | ------------------------------------------- |
| `DB_USER`         | Usuario de MySQL                            |
| `DB_PASSWORD`     | Contraseña de MySQL                         |
| `GEMINI_API_KEY`  | Clave de API de Google Gemini               |
| `JWT_SECRET`      | Secreto para firmar tokens JWT              |
| `VM_IP`           | IP pública de la VM en GCP                  |
| `VM_USER`         | Usuario SSH de la VM                        |
| `SSH_PRIVATE_KEY` | Clave privada SSH para conectarse a la VM   |
| `DOMAIN`          | Dominio Duck DNS (ej: `mi-app.duckdns.org`) |
| `CERTBOT_EMAIL`   | Email para notificaciones de Let's Encrypt  |

## Pipeline CI/CD

Se configuró un workflow de **GitHub Actions** que se ejecuta automáticamente ante cualquier push o merge a la rama `main`. El pipeline realiza los siguientes pasos:

1. Conectarse a la VM mediante SSH
2. Obtener los últimos cambios del repositorio (`git pull`)
3. Generar el archivo `.env` en la VM a partir de los secrets de GitHub
4. Reiniciar los containers `app` y `nginx` con el perfil `https`
