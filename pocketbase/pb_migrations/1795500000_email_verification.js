/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    app
      .db()
      .newQuery("UPDATE fans SET verified = 1 WHERE verified = 0")
      .execute();

    const webUrl = $os.getenv("WEB_URL") || "http://localhost:5173";
    const collection = app.findCollectionByNameOrId("pbc_2615713020");

    unmarshal(
      {
        verificationTemplate: {
          subject: "Verify your {APP_NAME} email",
          body:
            '<p>Hello,</p>\n<p>Thank you for joining us at {APP_NAME}.</p>\n<p>Click on the button below to verify your email address.</p>\n<p>\n  <a class="btn" href="' +
            webUrl +
            '/verify-email?token={TOKEN}" target="_blank" rel="noopener">Verify</a>\n</p>\n<p><i>If you didn\'t recently register, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>',
        },
      },
      collection,
    );
    app.save(collection);

    const host = $os.getenv("SMTP_HOST");
    if (host) {
      const settings = app.settings();
      settings.smtp.enabled = true;
      settings.smtp.host = host;
      settings.smtp.port = parseInt($os.getenv("SMTP_PORT") || "587", 10);
      settings.smtp.username = $os.getenv("SMTP_USER");
      settings.smtp.password = $os.getenv("SMTP_PASS");
      settings.smtp.tls = $os.getenv("SMTP_TLS") === "true";
      settings.meta.senderAddress =
        $os.getenv("SMTP_FROM") || "no-reply@roundpicks.local";
      settings.meta.senderName = "RoundPicks";
      app.save(settings);
    }
  },
  (app) => {
    // no-op
  },
);
