server {
    listen 80;
    server_name {{DOMAIN}};

    root {{PUBLIC_DIR}};
    index index.html;

    location / {
        autoindex off;
        try_files $uri =404;
    }

    location = /manifest.json {
        add_header Cache-Control "no-store";
        try_files $uri =404;
    }

    location = /genesis.json {
        add_header Cache-Control "public, max-age=300";
        try_files $uri =404;
    }

    location = /NETWORK.md {
        add_header Cache-Control "public, max-age=300";
        try_files $uri =404;
    }

    location = /status.json {
        add_header Cache-Control "no-store";
        try_files $uri =404;
    }
}
