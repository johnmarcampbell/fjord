IMAGE   := fjord
PORT    := 3000
DATA    := $(CURDIR)/data

.PHONY: build run dev test

build:
	docker build -t $(IMAGE) .

run:
	rm -rf $(DATA)
	mkdir -p $(DATA)
	-docker stop $(IMAGE) 2>/dev/null
	-docker rm $(IMAGE) 2>/dev/null
	docker run -d --name $(IMAGE) -p $(PORT):3000 \
		-v $(DATA):/data \
		-e FJORD_SEED_USERS="$$FJORD_SEED_USERS" \
		-e FJORD_DEMO_MODE \
		$(IMAGE)

demo:
	FJORD_DEMO_MODE=true $(MAKE) run