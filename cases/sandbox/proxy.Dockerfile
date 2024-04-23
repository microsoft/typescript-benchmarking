# Using the node image is overkill, but we're already going to pull it.
ARG BASE_IMAGE=
FROM ${BASE_IMAGE}

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
^github\.com$
^saucelabs\.com$
^nodejs\.org$
EOF

CMD ["/usr/bin/tinyproxy", "-d"]
