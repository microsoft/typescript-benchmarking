# ansible

This folder contains the ansible playbooks used to set up perf machines.

For this ansible playbook to work, you must have added your SSH key to the
remote systems. This can be achieved by using something like:

```sh
$ ssh-copy-id -i ~/.ssh/id_ed25519.pub user@hostname
```

You'll need `inventory.yml`, which should look something like:

```yml
tsperf:
  children:
    pool:
      children:
        group1:
          hosts:
            ts-perf1:
              ansible_host: 0.0.0.1
            ts-perf2:
              ansible_host: 0.0.0.2
            ts-perf3:
              ansible_host: 0.0.0.3
            ts-perf4:
              ansible_host: 0.0.0.4
          vars:
            ansible_connection: ssh
            ansible_user: someuser
            ansible_become_pass: '{{ secret_password }}'
            # All machines are identical; I checked "lscpu -e" and chose the values of
            # "CPU" on that would free up a single "CORE".
            isolated_cpus: '14,15'
            # Bless one of the isolated CPUs as the benchmark CPU.
            benchmark_cpu: '14'
      vars:
        azdo_url: https://typescript.visualstudio.com
        agent_pool: ts-perf-ddfun
```

Note: ensure that the hostnames are unique, and are added to `benchmark.yml` and `setupPipeline.ts`.

You'll also need to create `secrets.yml`, which looks like:

```yml
secret_azdo_pat: ...
secret_password: ...
```

But with the values plugged in. Make sure to include secrets referenced by `inventory.yml` if needed.

Some basic usage:

```sh
# Get everything set up
$ ansible-playbook -i /path/to/inventory.yml -e @/path/to/secrets.yml setup.yml

# Force a reconfigure of the agent
$ ansible-playbook -i /path/to/inventory.yml -e @/path/to/secrets.yml setup.yml -e '{"remove_agent": true}'

# Stop the agent and deconfigure it
$ ansible-playbook -i /path/to/inventory.yml -e @/path/to/secrets.yml setup.yml -e '{"remove_agent": true, "install_agent": false}'

# Reboot all of the machines
$ ansible-playbook -i /path/to/inventory.yml -e @/path/to/secrets.yml reboot.yml

# Update all of the machines
$ ansible-playbook -i /path/to/inventory.yml -e @/path/to/secrets.yml update.yml
```
