# Deploy

The app runs on Vercel at `https://tasks.gorecki.cc`.
The data is in a Neon Postgres database in Frankfurt.
Do these steps one time, in this order.

## How the deploy works

`pnpm build:vercel` builds the app with Vite.
Then `server/production/build-output.ts` writes the [Vercel Build Output](https://vercel.com/docs/build-output-api) to `.vercel/output`:

- `static/` has the app.
- `functions/api.func/` is one Node.js 26 function in `fra1` for all of `/api`.
  It is one bundled file, so it needs no `node_modules`.
- `config.json` has the routes and the security headers.

Vercel uses this folder as it is.
`vercel.json` only tells Vercel which commands to run.

## 1. Neon

1. Create a Neon project in the region **AWS Europe Central 1 (Frankfurt)**.
2. Open **Connect** on the project page.
3. Copy the connection string **with** connection pooling.
   This is `DATABASE_URL` for Vercel.
4. Copy the connection string **without** connection pooling.
   You use it only for the migrations.

## 2. Migrations

Run the migrations before each deploy that adds a migration in `server/db/migrations`.
The deploy does not run them, so a preview build never changes the production database.

```sh
DATABASE_URL='<connection string without pooling>' pnpm db:migrate
```

The command writes "The database is up to date." when it is done.
Each migration runs one time only, so you can run the command again safely.

A new migration must work with the code that is live now, because the old code runs until the deploy is done.

## 3. Vercel project and domain

1. Import the Git repository as a new Vercel project.
   Do not change the build settings: `vercel.json` sets them.
2. Open **Settings > Domains** and add `tasks.gorecki.cc`.
3. At the DNS provider of `gorecki.cc`, add the record that Vercel shows.
   For a subdomain, this is a `CNAME` record for `tasks`.
4. Wait until Vercel shows the domain as valid.
   Vercel then serves it with HTTPS.

## 4. Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project or select one.
2. Open **Google Auth Platform > Branding** and set the app name, the support email and the home page `https://tasks.gorecki.cc`.
3. Open **Audience**, select **External**, and publish the app.
   Before you publish, only the test users that you add can sign in.
4. Open **Clients** and create a client of the type **Web application**.
5. Add the authorized JavaScript origin `https://tasks.gorecki.cc`.
6. Add the authorized redirect URI `https://tasks.gorecki.cc/api/auth/callback/google`.
7. Copy the client ID and the client secret.

## 5. GitHub sign-in

1. Open GitHub **Settings > Developer settings > OAuth Apps > New OAuth App**.
2. Set the homepage URL to `https://tasks.gorecki.cc`.
3. Set the authorization callback URL to `https://tasks.gorecki.cc/api/auth/callback/github`.
4. Create the app, then create a client secret.
5. Copy the client ID and the client secret.

## 6. Environment variables

Open **Settings > Environment Variables** in the Vercel project.
Add each variable for the **Production** environment only.

| Variable               | Value                                    |
| ---------------------- | ---------------------------------------- |
| `DATABASE_URL`         | The Neon connection string with pooling. |
| `BETTER_AUTH_SECRET`   | The output of `openssl rand -base64 32`. |
| `BETTER_AUTH_URL`      | `https://tasks.gorecki.cc`               |
| `GOOGLE_CLIENT_ID`     | From step 4.                             |
| `GOOGLE_CLIENT_SECRET` | From step 4.                             |
| `GITHUB_CLIENT_ID`     | From step 5.                             |
| `GITHUB_CLIENT_SECRET` | From step 5.                             |

Mark the secrets as **Sensitive**.
If you change `BETTER_AUTH_SECRET`, all users must sign in again.

Preview deploys get no variables.
Their API then does not start, so the app on a preview works only on the device, without an account.
The function logs tell which variables are missing or not valid.

## 7. Rate limits

Better Auth limits the sign-in requests of each client IP.
The counts are in the table `rate_limits`, so all function instances share them.
The client IP comes from the header `x-vercel-forwarded-for`, which only Vercel sets.

The sync endpoints have no limit in the app.
Add a rule in the Vercel Firewall for them:

1. Open **Firewall > Configure** in the Vercel project, and add a custom rule.
2. Set the condition: **Request Path** starts with `/api/sync/`.
3. Set the action **Rate Limit**: 300 requests in 60 seconds for each IP address, then **429**.
4. Save and publish the rule.

One device sends at most about 2 requests each second while the user makes changes, and 2 requests every 30 seconds when the user does nothing.
The limit lets more devices behind one IP address sync, for example in one home.
After a 429, the app shows an error and tries again later, with a longer wait each time, up to 60 seconds.

## 8. Deploy

1. Run the migrations (step 2).
2. Push to the production branch, or run **Redeploy** in Vercel.

## 9. Check the deploy

Do these checks after the first deploy, and after a change to the server or to the build:

1. Open `https://tasks.gorecki.cc/api/providers`.
   It shows `{"providers":["google","github"]}`.
2. Open `https://tasks.gorecki.cc/api/nothing`.
   It shows `{"error":"notFound"}` with the status 404.
3. Open `https://tasks.gorecki.cc/settings` and reload the page.
   The settings show, not a 404 page.
4. Sign in with Google, add a list, and open the app on a second device with GitHub and the same email.
   The list shows on the second device.
5. In the browser developer tools, check that the page has the header `Content-Security-Policy`, and that the console shows no blocked resources.
6. Send 4 sign-in requests from one IP address in 10 seconds:

   ```sh
   for i in 1 2 3 4; do
     curl -s -o /dev/null -w '%{http_code}\n' -X POST https://tasks.gorecki.cc/api/auth/sign-in/social \
       -H 'Content-Type: application/json' -H 'Origin: https://tasks.gorecki.cc' \
       -d '{"provider":"github","callbackURL":"/"}'
   done
   ```

   The output is `200`, `200`, `200`, `429`.
