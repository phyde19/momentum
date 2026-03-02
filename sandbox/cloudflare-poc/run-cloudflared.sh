#!/usr/bin/env bash

docker run --rm -it \
  --network cloudflare-poc_default \
  cloudflare/cloudflared:latest \
  tunnel --url http://poc:8080