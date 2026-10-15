# Project 02: Your Dev Portfolio in a Docker Container

In this project you put a **React** portfolio website into Docker, in two ways:

- **Development**: you edit code and the browser updates by itself (hot reload).
- **Production**: a small, clean image that only contains the finished website.

You go from "`npm run dev` works on my laptop" to "`docker compose up` works on any computer".

This is part of a series. Do [Project 01](https://github.com/MelikaMak/Docker-Project-01-Containerize-a-Static-Website) first: this project uses images, containers, ports, and volumes without explaining them again.

## What you will learn

- **Multi-stage builds**: build with Node.js, then ship without it
- Why some images are huge, and how to make them small
- **Layer caching**: why the order of lines in a Dockerfile matters
- **`.dockerignore`**: keeping junk out of your images
- Different ports for development and production
- **Docker Compose**: starting everything with one command

## What is in this repo

```
Docker-Project-02-Dev-Portfolio/
├── README.md          <- this lesson
├── Dockerfile         <- one file, four stages (deps, dev, build, prod)
├── compose.yaml       <- runs dev and prod with one command
├── .dockerignore      <- what Docker should NOT copy into images
├── package.json       <- the npm packages the app needs
├── package-lock.json  <- the exact versions of those packages
├── vite.config.js     <- settings for Vite (the dev server and build tool)
├── index.html         <- the single HTML page React starts from
├── public/            <- files copied as they are (the favicon)
└── src/
    ├── data.js        <- YOUR TEXT: name, skills, projects. Edit this!
    ├── App.jsx        <- the page layout
    ├── main.jsx       <- starts React
    └── index.css      <- the styles
```

## Before you start

- **Docker Desktop** (Windows/macOS) or **Docker Engine** (Linux), working like in Project 01.
- **You do NOT need Node.js installed.** Everything Node-related runs inside containers. That is one of the points of this project.

Get the code and open a terminal in the folder:

```bash
git clone https://github.com/MelikaMak/Docker-Project-02-Dev-Portfolio.git
cd Docker-Project-02-Dev-Portfolio
```

---

## Part 0: The big idea

A React app has two lives:

| | Development | Production |
|---|---|---|
| What runs | Vite dev server (Node.js) | Any web server (we use Nginx) |
| What it serves | Your source code, changed on the fly | Finished HTML, CSS, JS files |
| Needs Node.js and `node_modules`? | Yes | **No** |
| Port in this project | 5173 | 80 (we open it as 8080) |

The key word is **build**. `npm run build` turns your React code into plain files in a `dist/` folder. After that, Node.js is not needed anymore. Any web server can serve `dist/`.

Think of a restaurant: the **kitchen** (Node.js, `node_modules`, tools) is big and messy. The guest only gets the **plate** (`dist/`). You don't send the kitchen with the plate.

A **multi-stage build** does exactly that: one stage is the kitchen, the last stage is the plate.

---

## Part 1: Look at the app

Open `src/data.js`. All the text on the site is there: your name, skills, and projects. You will edit this later. The other files in `src/` are the layout and styles.

**How was this app made?** With the Vite starter:

```bash
npm create vite@latest my-portfolio -- --template react
```

Note the `--` before `--template`. It tells npm "the next options are for Vite, not for npm". Without it, newer npm versions don't pass the option on, and Vite asks you questions instead. After that, the starter was cleaned up: example images and the code checker (linter) were removed, so there are fewer packages.

You don't need to run this command. The app is already here.

---

## Part 2: The production image (multi-stage build)

Open the `Dockerfile`. It has **four stages**. Each stage starts with `FROM` and gets a name with `AS`:

```
deps  ──►  dev      (development server)
  │
  └────►  build  ──►  prod   (final image: Nginx + dist only)
```

### Stage 1: `deps`, install packages

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
```

- `node:24-alpine`: Node.js 24 on small Alpine Linux.
- `AS deps`: gives this stage a name, so other stages can use it.
- `npm ci`: installs the **exact** versions from `package-lock.json`. Use `npm ci` instead of `npm install` in Docker. It is faster and gives the same result every time.
- Why copy only the package files first? See Part 4.

### Stage 2: `dev`, for development

```dockerfile
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
```

`FROM deps` means "start from where the `deps` stage ended". The packages are already installed. We use this stage in Part 6.

### Stage 3: `build`, make the finished files

```dockerfile
FROM deps AS build
COPY . .
RUN npm run build
```

After this, the finished website is in `/app/dist`.

### Stage 4: `prod`, the final image

```dockerfile
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

This is the important part:

- `FROM nginx:alpine` starts a **brand new, empty image**. Nothing from the earlier stages is in it.
- `COPY --from=build` copies files **from another stage** instead of from your computer. We take only `dist/`.
- Node.js, `node_modules`, and your source code stay behind in the `build` stage. They are **not** in the final image.

### Build and run it

```bash
docker build -t my-portfolio .
docker run --rm -p 8080:80 my-portfolio
```

Open **http://localhost:8080**. Press `Ctrl+C` to stop.

By default, `docker build` builds the **last** stage in the file, which is `prod`. Docker only builds the stages that `prod` needs (`deps` → `build` → `prod`). The `dev` stage is skipped.

You can build a specific stage with `--target`:

```bash
docker build --target dev -t my-portfolio-dev .
```

---

## Part 3: Why is my container so big?

Let's measure. Build the `build` stage as its own image. This is what you would get with a simple one-stage Dockerfile:

```bash
docker build --target build -t portfolio-one-stage .
docker images
```

Compare `portfolio-one-stage` and `my-portfolio` in the `SIZE` column. The one-stage image has Node.js, all `node_modules`, and your source code. The multi-stage image has only Nginx and a few small files. Expect a difference of several times. (The exact numbers depend on versions, so check your own.)

Small images are better because:

- They download and start faster.
- They use less disk space on servers.
- **Less software inside = fewer security problems.** A program that is not there cannot be attacked.

Want to see what takes up the space? This shows every layer and its size:

```bash
docker history my-portfolio
docker history portfolio-one-stage
```

---

## Part 4: Layer caching (why the order matters)

Every line in a Dockerfile makes a **layer**. Docker saves (caches) each layer. On the next build, Docker reuses a saved layer **if nothing it depends on has changed**. But once one layer changes, **every layer after it is built again**.

Many tutorials write it like this:

```dockerfile
COPY . .
RUN npm install && npm run build
```

Problem: if you change **any** file (even one word in `data.js`), `COPY . .` changes, so `npm install` runs again from zero. Every build re-downloads all packages.

Our Dockerfile does this instead:

```dockerfile
COPY package.json package-lock.json ./   # changes only when packages change
RUN npm ci                               # so this is cached most of the time
COPY . .                                 # your code changes often, that's fine
RUN npm run build                        # only this runs again
```

**Try it:** change some text in `src/data.js`, then build again:

```bash
docker build -t my-portfolio .
```

In the output, the `npm ci` step says **`CACHED`**. Only the steps after `COPY . .` run again. The build is much faster.
<img width="1087" height="560" alt="image" src="https://github.com/user-attachments/assets/be32342d-4f4c-4dfe-8365-66ddee2f6a47" />


**Rule:** put things that change **rarely** at the top, and things that change **often** at the bottom.

---

## Part 5: `.dockerignore`

`COPY . .` copies everything in the folder. Open `.dockerignore`. These are left out:

| Ignored | Why |
|---|---|
| `node_modules` | Packages are installed **inside** the image with `npm ci`. Your own `node_modules` can be big, and if you ran `npm install` on Windows, some packages contain **Windows programs** that don't work on Linux. Copying them in would break the build or overwrite the good ones. |
| `dist` | It is built inside the image. An old copy from your computer would only confuse things. |
| `.git` | Your git history. Not needed, and can be big. |
| `Dockerfile`, `compose.yaml`, `README.md`, ... | Not needed to build the website. |

Bonus: changing this README does not break the build cache, because Docker never sees it.

---

## Part 6: Development inside a container

For development you want **hot reload**: save a file, and the browser updates by itself. Vite does this, but Vite needs Node.js. So we run it in a container and share our code with a volume.

### The quick way (to understand it)

```bash
docker run -it --rm -p 5173:5173 -v "${PWD}:/app" -w /app -e WATCH_POLLING=true node:24-alpine sh
```

- `-it`: interactive, you get a shell inside the container.
- `-w /app`: start in `/app` (like `WORKDIR`).
- `-e WATCH_POLLING=true`: sets an environment variable. It helps Vite notice your changes on Windows and Mac (explained in Part 7).

Then, **inside** the container:

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Change `src/data.js` and save: the page updates by itself.

Type `Ctrl+C` and then `exit` to leave.

There are two things to understand here.

**1. Why does the browser reach Vite at all?**
Normally Vite only listens on `localhost`. Inside a container, `localhost` means **the container itself**, not your computer. So your browser could not reach it, even with `-p`. That's why `vite.config.js` has:

```js
server: { host: true }
```

This tells Vite to listen on all network addresses. Many tutorials forget this, and you get "This site can't be reached".

**2. The problem with this way:**
`npm install` ran inside a Linux container, but it wrote `node_modules` into **your** folder, through the volume. On Windows or Mac, you now have Linux packages on your computer. If you later run `npm` directly on your computer, things can break. You can delete that `node_modules` folder now.

Docker Compose fixes this.

---

## Part 7: Docker Compose, one command for everything

Typing long `docker run` commands gets old fast. **Docker Compose** saves all the settings in a file: `compose.yaml`.

```yaml
name: portfolio

services:
  dev:
    build:
      context: .
      target: dev
    ports:
      - "5173:5173"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - WATCH_POLLING=true

  prod:
    build:
      context: .
      target: prod
    ports:
      - "8080:80"
```

Each **service** is one container. Line by line:

- `build: context: .` → like the `.` in `docker build .`
- `target: dev` → like `docker build --target dev`
- `ports` → like `-p`
- `volumes: - .:/app` → like `-v "${PWD}:/app"`, your live code
- `volumes: - /app/node_modules` → **the trick that fixes Part 6.** This keeps a separate place for `/app/node_modules` that **is not** your folder. The container uses the Linux packages that `npm ci` installed in the image, and nothing is written into your folder.
- `WATCH_POLLING=true` → On Windows and Mac, file changes in a shared folder often don't reach the container. With this, Vite checks the files for changes again and again, instead of waiting for a signal (see `vite.config.js`).

### Use it

```bash
docker compose up dev        # development, http://localhost:5173
docker compose up prod       # production,  http://localhost:8080
docker compose up            # both
```

The first time, Compose builds the images. Press `Ctrl+C` to stop.

Useful extras:

```bash
docker compose up -d                # run in the background
docker compose logs -f dev          # follow the logs of "dev"
docker compose ps                   # what is running
docker compose down                 # stop and remove the containers
docker compose up --build prod      # rebuild the image first
```

**Important:** the `prod` service has **no volume**. Its website is baked into the image at build time (like `COPY` in Project 01). After you change code, you must run `docker compose up --build prod` to see the change there.

> **Note:** You may see `docker-compose` (with a dash) in older tutorials. That is the old version 1. Today it is `docker compose` (with a space), built into Docker.

---

## What does "production-ready" mean here?

What this project gives you:

- A small image with **only** the finished files and a web server.
- No Node.js, no `node_modules`, no source code in production.
- The same build every time (`npm ci` + `package-lock.json`).

What a real production setup **also** needs (later projects):

- HTTPS
- Nginx settings for caching and security headers
- Running the container as a non-root user
- Health checks

So: a good start, not the whole story.

---

## Cheat sheet

```bash
# Plain Docker
docker build -t NAME .                    # build the last stage
docker build --target STAGE -t NAME .     # build up to one stage
docker history NAME                       # layers and their sizes
docker images                             # list images and sizes

# Docker Compose
docker compose up [SERVICE]               # build if needed, then start
docker compose up --build [SERVICE]       # always rebuild first
docker compose up -d                      # in the background
docker compose logs -f SERVICE            # follow logs
docker compose exec SERVICE sh            # shell inside a running service
docker compose run --rm dev npm install X # run a one-off command (add a package)
docker compose down                       # stop and remove containers
```

---

## When something goes wrong

**Dev: "This site can't be reached" on localhost:5173**
Vite is only listening inside the container. Check that `vite.config.js` has `host: true`. Check `docker compose logs dev`: it should show a `Network:` address.

**Dev: I save a file, but nothing changes**
File change signals don't reach the container. Check that `WATCH_POLLING=true` is in `compose.yaml`. Restart with `docker compose up dev`.

**Prod: I changed something, but localhost:8080 shows the old site**
Prod has no volume. Rebuild: `docker compose up --build prod`. Then do a hard refresh (`Ctrl+Shift+R`).

**I added a package, and dev says it cannot find it**
The `/app/node_modules` volume still has the old packages. Rebuild and make a fresh volume:

```bash
docker compose up --build -V dev
```

(`-V` means "make new anonymous volumes".)

**`npm ci` fails: "package.json and package-lock.json are not in sync"**
You changed `package.json` but not the lock file. Update it without installing Node on your computer:

```bash
docker run --rm -v "${PWD}:/app" -w /app node:24-alpine npm install --package-lock-only
```

**"port is already allocated"**
Something already uses that port, maybe the Project 01 container. Run `docker ps` and stop it, or change the left number in `ports`.

---

## Exercises

Try each one before you open the solution.

### 1. Make it yours

Start dev mode and change `src/data.js` to your own name, skills, and projects. Watch the browser. Then start prod. Does prod show your changes? Why or why not?

<details>
<summary>Solution</summary>

```bash
docker compose up dev
```

Edit `src/data.js` and save. The page on http://localhost:5173 updates by itself, because the `dev` container sees your live files through the volume.

```bash
docker compose up prod
```

If the `prod` image was built **before** your changes, http://localhost:8080 shows the **old** text. Prod has no volume. Its files were baked in at build time. Rebuild:

```bash
docker compose up --build prod
```

</details>

### 2. Prove there is no Node.js in production

Start `prod` and look inside the container. Is Node.js there? What files are in the web folder?

<details>
<summary>Solution</summary>

```bash
docker compose up -d prod
docker compose exec prod sh
```

Inside:

```sh
node --version                 # "node: not found"
ls /usr/share/nginx/html       # index.html, assets/, favicon.svg
ls /usr/share/nginx/html/assets
exit
```

Only the finished files are there. Compare with the dev container:

```bash
docker compose up -d dev
docker compose exec dev node --version
docker compose exec dev ls
docker compose down
```

</details>

### 3. Break the cache on purpose

Change the `deps` stage so it copies everything first (the "tutorial way"):

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY . .
RUN npm ci
```

Build once. Change one word in `src/data.js`. Build again. What happens to the `npm ci` step? Change the Dockerfile back afterwards.

<details>
<summary>Solution</summary>

```bash
docker build -t my-portfolio .
# change a word in src/data.js
docker build -t my-portfolio .
```

On the second build, `npm ci` is **not** `CACHED`. It runs again and downloads every package, even though no package changed. `COPY . .` saw a changed file, so every step after it was rebuilt.

With the original order, only `package.json` and `package-lock.json` are copied before `npm ci`. Changing `data.js` doesn't affect that step, so it stays cached.

In this small project, `npm ci` is fast. In a real project with hundreds of packages, this can save minutes on every build.

</details>

### 4. Break `host: true`

In `vite.config.js`, delete the line `host: true,`. Restart dev mode. Can you open http://localhost:5173? Read the logs. Then change it back.

<details>
<summary>Solution</summary>

```bash
docker compose up dev
```

The browser can't reach the site. In the logs, Vite shows only a `Local: http://localhost:5173/` line and `Network: use --host to expose`. It is listening only on the container's own `localhost`. The port mapping (`-p 5173:5173`) sends traffic to the container's network address, where nothing is listening.

Put the line `host: true,` back and run `docker compose up dev` again.

</details>

### 5. Measure your sizes

Fill in this table with the numbers from `docker images` on your computer:

| Image | What's inside | Size |
|---|---|---|
| `nginx:alpine` | Only Nginx | ? |
| `portfolio-prod` | Nginx + your site | ? |
| `portfolio-dev` | Node.js + packages + code | ? |

How much does your website add on top of `nginx:alpine`?

<details>
<summary>Solution</summary>

```bash
docker compose build
docker images
```

`portfolio-prod` is almost the same size as `nginx:alpine`. Your whole website (`dist/`) adds well under 1 MB. `portfolio-dev` is several times bigger, because it has Node.js and all of `node_modules`.

Lesson: the size of a production image is decided almost fully by its **base image**. Pick a small one (like `alpine`), and don't carry build tools into it.

</details>

---

## Clean up

```bash
docker compose down
docker rmi my-portfolio my-portfolio-dev portfolio-one-stage portfolio-dev portfolio-prod
```

(If one of these images doesn't exist, Docker shows an error for it. That's fine.)

---

## What you know now

- A **multi-stage build** uses one stage to build and a fresh stage to ship. `COPY --from=STAGE` moves only what you need.
- `--target` builds only up to a certain stage.
- **Layer order matters**: rarely changed things first (package files, `npm ci`), often changed things last (your code).
- `.dockerignore` keeps `node_modules`, `dist`, and other junk out of the build.
- Inside a container, a dev server must listen on all addresses (`host: true`).
- **Docker Compose** stores your run settings in `compose.yaml`, so `docker compose up` is all anyone needs.
- Dev = live code, volumes, Node.js. Prod = baked-in files, no Node.js, small image.
