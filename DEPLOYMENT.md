# Deployment

## Infraestructura en Google Cloud Platform

Se creó una máquina virtual en **Google Compute Engine** (GCP) con sistema operativo Debian. Se reservó una **IP estática externa** y se asignó a la instancia para garantizar que la dirección no cambie entre reinicios. Se configuraron las reglas de firewall para permitir tráfico HTTP (puerto 80).

## Contenedores Docker

La aplicación se ejecuta mediante **Docker Compose** con dos servicios:

- **app**: servidor Node.js/Express
- **mysql**: base de datos MySQL 8

El código fuente se monta como volumen en el container de la aplicación, lo que permite actualizar el código sin necesidad de reconstruir la imagen Docker en cada deploy.

## Dominio

Se configuró un subdominio gratuito mediante **Duck DNS**, apuntando a la IP estática de la VM. Esto permite acceder a la aplicación mediante una URL sin exponer la IP directamente ni incluir el puerto en la URL.

## Secrets en GitHub Actions

Las credenciales sensibles (usuario y contraseña de la base de datos, clave de API de Gemini, datos de conexión SSH a la VM) se almacenaron como **secrets en el repositorio de GitHub**. De esta forma no se incluyen en el código fuente ni en el historial de git.

## Pipeline CI/CD

Se configuró un workflow de **GitHub Actions** que se ejecuta automáticamente ante cualquier push o merge a la rama `main`. El pipeline realiza los siguientes pasos:

1. Conectarse a la VM mediante SSH
2. Obtener los últimos cambios del repositorio (`git pull`)
3. Generar el archivo `.env` en la VM a partir de los secrets de GitHub
4. Reiniciar el container de la aplicación para aplicar los cambios
