# Using the docker image is overkill, but we're already going to pull it.
FROM docker.io/library/node:20-bookworm

RUN apt-get update && apt-get install -y tinyproxy

RUN cat <<EOF > /etc/tinyproxy/tinyproxy.conf
Port 8888
User nobody
Group nogroup
Timeout 600
Filter "/etc/tinyproxy/filter"
FilterDefaultDeny Yes
LogLevel Notice
EOF

RUN cat <<EOF > /etc/tinyproxy/filter
^registry\.npmjs\.org$
^registry\.yarnpkg\.com$
^codeload\.github\.com$
EOF

CMD ["/usr/bin/tinyproxy", "-d"]
