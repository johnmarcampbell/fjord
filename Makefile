IMAGE   := agentic-kanban
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
		-e KANBAN_SEED_USERS="$$KANBAN_SEED_USERS" \
		-e KANBAN_DEMO_MODE \
		$(IMAGE)

demo:
	KANBAN_DEMO_MODE=true $(MAKE) run