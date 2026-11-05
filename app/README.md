# Login + file rating app

GitHub Pages is static and cannot host a secure login, so this runs as a separate Node (18+) server with no dependencies.

    ADMIN_PASSWORD='choose-one' node app/server.js   # http://localhost:3000

- Admin user `closeyes` is created on first start (password from `ADMIN_PASSWORD`, or generated and printed).
- Put images/PDFs in `app/data/files/`. The admin page (`/admin`) creates users and sets which files each can see.
- Rating bar: click/touch position gives 0.0–10.0 (one decimal). Ratings are stored per user in `app/data/ratings.json`.
- Serve behind HTTPS in production (add `Secure` to the cookie).
