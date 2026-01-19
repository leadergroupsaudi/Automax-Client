#!/bin/sh

# Generate runtime config from environment variables
cat <<EOF > /app/dist/config.js
window.APP_CONFIG = {
  API_URL: "${VITE_API_URL:-http://localhost:8080/api/v1}"
};
EOF

echo "Generated config.js with API_URL: ${VITE_API_URL:-http://localhost:8080/api/v1}"

# Start the server
exec serve -s dist -l 3000
