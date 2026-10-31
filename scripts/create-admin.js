require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, getPool } = require('../src/db');

/** Uso: npm run create-admin -- correo@ejemplo.com "ContraseñaSegura123" */
(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Uso: npm run create-admin -- correo@ejemplo.com "ContraseñaDe8+Caracteres"');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const r = await query(
    `MERGE Users AS t USING (SELECT @email AS email) AS s ON t.email = s.email
     WHEN MATCHED THEN UPDATE SET role = 'admin', password_hash = @hash
     WHEN NOT MATCHED THEN INSERT (email, password_hash, role, name) VALUES (@email, @hash, 'admin', 'Admin')
     OUTPUT INSERTED.id;`,
    { email: email.toLowerCase(), hash }
  );
  const id = r.recordset[0].id;
  await query('IF NOT EXISTS (SELECT 1 FROM Profiles WHERE user_id = @id) INSERT INTO Profiles (user_id) VALUES (@id)', { id });
  console.log(`✔ Administrador listo: ${email}`);
  (await getPool()).close();
})().catch((e) => { console.error('✖', e.message); process.exit(1); });
