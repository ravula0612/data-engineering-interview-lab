# Data Engineering Interview Lab

[Open the free practice site](https://ravula0612.github.io/data-engineering-interview-lab/)

Practice data engineering interviews with 32 original prompts, worked solutions, three timed mock rounds, and a four-week roadmap. The site is open to everyone and requires no account.

- **Topics** include SQL, Python, Spark, Databricks, streaming, data modeling, data quality, and system design.
- **Practice** by searching or filtering questions, attempting them before revealing the answer, and marking them as practiced. Progress stays in your browser.
- **Mock interviews** use a countdown and a self-review rubric. Mock notes stay in the open page and clear when it reloads.
- **Share** individual prompts with a link. Start with [replaying a stream after a crash](https://ravula0612.github.io/data-engineering-interview-lab/#q=str-replay).

## Run locally

Serve the static files with Python 3.

```sh
python -m http.server 8000 --directory docs
```

Open [http://localhost:8000](http://localhost:8000). The site has no build step or runtime dependencies and publishes from `main:/docs` on GitHub Pages.

## Contribute

[Open an issue](https://github.com/ravula0612/data-engineering-interview-lab/issues/new) to propose a question or report a correction. For a new question, provide an original scenario, explicit assumptions, a worked answer, and three grading criteria. Use synthetic data and link to official documentation for product-specific behavior. Questions live in [docs/questions.js](docs/questions.js).

The site code and original practice material are offered under the [Zero-Clause BSD license](LICENSE).
