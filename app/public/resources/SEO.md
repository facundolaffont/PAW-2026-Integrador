## Por que robots.txt y sitemap.xml?

El `sitemap.xml` le dice "estas páginas existen", pero no le impide al crawler ir a explorar otras
por su cuenta siguiendo links. El `robots.txt` es el que realmente le cierra el paso a las rutas
que no querés indexar.

Sin `robots.txt` → Google rastrea las páginas del sitemap más todo lo que encuentre siguiendo
links (partidas, salas, API, etc.).

Sin `sitemap.xml` → Google respeta los bloqueos del robots.txt, pero descubre las páginas
permitidas solo si encuentra links que apunten a ellas. Más lento, menos garantizado.
