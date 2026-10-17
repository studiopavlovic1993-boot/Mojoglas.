# MojOglas — početni oglasnik

Ovo je početni full-stack projekat za oglasnik na srpskom jeziku. Sadrži:
- Registraciju i prijavu korisnika
- Postavljanje oglasa sa naslovom, opisom, cenom, kategorijom, gradom, telefonom i jednom fotografijom
- Oglase koji se čuvaju u SQLite bazi
- Oglase na čekanju dok ih administrator ne odobri
- Pretragu, kategorije i detalje oglasa
- Korisnički deo za pregled i brisanje sopstvenih oglasa
- Administratorski API za odobravanje/odbijanje oglasa

## Lokalno pokretanje

Potrebno je instalirati Node.js 18 ili noviji.

1. Raspakuj projekat.
2. U terminalu, u folderu projekta, pokreni `npm install`.
3. Podesi promenljive okruženja (primer za macOS/Linux):

   ```bash
   export SESSION_SECRET="ovde-stavi-dug-nasumican-tajni-string"
   export ADMIN_EMAIL="tvoj-email@example.com"
   export ADMIN_PASSWORD="jaka-admin-lozinka"
   npm start
   ```

   Na Windows PowerShell-u:
   ```powershell
   $env:SESSION_SECRET="ovde-stavi-dug-nasumican-tajni-string"
   $env:ADMIN_EMAIL="tvoj-email@example.com"
   $env:ADMIN_PASSWORD="jaka-admin-lozinka"
   npm start
   ```

4. Otvori `http://localhost:3000`.

## Administracija

Za administratora se koristi nalog koji ima `ADMIN_EMAIL` kao email. Registruj se koristeći taj email. `ADMIN_PASSWORD` je dokumentovana kao deo podešavanja, ali trenutno admin status se vezuje za email; izaberi jaku lozinku i ne deli je. Prijavljeni administrator može da koristi:
- `GET /api/admin/ads` — svi oglasi
- `PATCH /api/admin/ads/:id` sa JSON telom `{"status":"approved"}` ili `{"status":"rejected"}`

Ove administratorske funkcije trenutno su API rute, bez gotovog administratorskog ekrana.

## Važno pre javnog objavljivanja

Ovo je MVP/prototip, nije potpuno produkcijski spreman. Pre javnog pokretanja obavezno:
- Podesi `SESSION_SECRET` kao dugu nasumičnu vrednost i `NODE_ENV=production`.
- Koristi HTTPS.
- Dodaj ograničenje pokušaja prijave, CSRF zaštitu i strožu validaciju upload-a (proveru stvarnog sadržaja fajla, ne samo MIME tipa).
- Podesi pouzdano trajno skladištenje baze i slika; lokalni fajlovi mogu biti izgubljeni na nekim hosting platformama.
- Dodaj admin ekran, email potvrdu, prijavu zloupotrebe, uslove korišćenja i politiku privatnosti.
- Dodaj automatske backup-e i proveri lokalne zakonske obaveze za lične podatke i online oglašavanje.

## Struktura

- `server.js` — Express server, API, baza i upload slika
- `public/index.html` — stranice i modalni prozori
- `public/style.css` — responsive dizajn
- `public/app.js` — interakcije i povezivanje sa API-jem
