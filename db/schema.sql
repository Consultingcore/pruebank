/* ============================================================
   Núcleo Kokón — Esquema SQL Server (Fase 1)
   Idempotente: se puede ejecutar varias veces.
   Ejecutar con:  npm run db:init
   ============================================================ */

IF OBJECT_ID('dbo.Users', 'U') IS NULL
CREATE TABLE dbo.Users (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  email         NVARCHAR(255) NOT NULL,
  password_hash NVARCHAR(255) NULL,            -- NULL para cuentas creadas solo con Google
  name          NVARCHAR(100) NULL,
  role          NVARCHAR(10)  NOT NULL CONSTRAINT DF_Users_role DEFAULT 'free',
  google_id     NVARCHAR(64)  NULL,
  created_at    DATETIME2     NOT NULL CONSTRAINT DF_Users_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Users_role CHECK (role IN ('admin', 'member', 'free'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Users_email')
  CREATE UNIQUE INDEX UX_Users_email ON dbo.Users(email);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Users_google')
  CREATE UNIQUE INDEX UX_Users_google ON dbo.Users(google_id) WHERE google_id IS NOT NULL;
GO

IF OBJECT_ID('dbo.PasswordResets', 'U') IS NULL
CREATE TABLE dbo.PasswordResets (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES dbo.Users(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL,               -- SHA-256 del token enviado por correo
  expires_at  DATETIME2 NOT NULL,
  used_at     DATETIME2 NULL,
  created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PasswordResets_token')
  CREATE INDEX IX_PasswordResets_token ON dbo.PasswordResets(token_hash);
GO

IF OBJECT_ID('dbo.Profiles', 'U') IS NULL
CREATE TABLE dbo.Profiles (
  user_id                INT PRIMARY KEY REFERENCES dbo.Users(id) ON DELETE CASCADE,
  diagnostico            NVARCHAR(MAX) NULL,
  indice_sostenibilidad  INT NOT NULL CONSTRAINT DF_Profiles_idx DEFAULT 50,
  habitos_personalizados NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Profiles_hab DEFAULT '[]',
  ancla_semanal          NVARCHAR(500) NULL,
  updated_at             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Profiles_idx CHECK (indice_sostenibilidad BETWEEN 0 AND 100),
  CONSTRAINT CK_Profiles_hab CHECK (ISJSON(habitos_personalizados) = 1)
);
GO

IF OBJECT_ID('dbo.Priorities', 'U') IS NULL
CREATE TABLE dbo.Priorities (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES dbo.Users(id) ON DELETE CASCADE,
  [date]       DATE NOT NULL,
  title        NVARCHAR(200) NOT NULL,
  is_completed BIT NOT NULL DEFAULT 0,
  is_event     BIT NOT NULL DEFAULT 0,         -- 1 = webinar / mentoría inyectada desde Cal.com
  event_type   NVARCHAR(10) NULL,              -- 'webinar' | 'mentoria'
  external_id  NVARCHAR(100) NULL,             -- uid de la reserva en Cal.com
  sort_order   TINYINT NOT NULL DEFAULT 1,
  created_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Priorities_order CHECK (sort_order BETWEEN 1 AND 4),
  CONSTRAINT CK_Priorities_event CHECK (event_type IS NULL OR event_type IN ('webinar', 'mentoria'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Priorities_user_date')
  CREATE INDEX IX_Priorities_user_date ON dbo.Priorities(user_id, [date]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Priorities_external')
  CREATE UNIQUE INDEX UX_Priorities_external ON dbo.Priorities(user_id, external_id) WHERE external_id IS NOT NULL;
GO

IF OBJECT_ID('dbo.CheckIns', 'U') IS NULL
CREATE TABLE dbo.CheckIns (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES dbo.Users(id) ON DELETE CASCADE,
  [date]     DATE NOT NULL,
  type       NVARCHAR(30) NOT NULL,            -- 'sueno', 'agua', ..., 'habito:<id>'
  value      NVARCHAR(100) NOT NULL,           -- escala 1-5 (o 5 = hecho para hábitos)
  photo_url  NVARCHAR(300) NULL,               -- foto del espacio (alimenta Comunidad)
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CheckIns_user_date_type')
  CREATE UNIQUE INDEX UX_CheckIns_user_date_type ON dbo.CheckIns(user_id, [date], type);
GO

IF OBJECT_ID('dbo.Bitacoras', 'U') IS NULL
CREATE TABLE dbo.Bitacoras (
  id               INT IDENTITY(1,1) PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES dbo.Users(id) ON DELETE CASCADE,
  week             CHAR(8) NOT NULL,           -- formato ISO: 2026-W40
  estado_inicial   NVARCHAR(MAX) NULL,
  registro_semanal NVARCHAR(MAX) NULL,
  objetivos        NVARCHAR(MAX) NOT NULL DEFAULT '[]',
  aprendizajes     NVARCHAR(MAX) NULL,
  distractores     NVARCHAR(MAX) NULL,
  semaforos        NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  created_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Bitacoras_obj CHECK (ISJSON(objetivos) = 1),
  CONSTRAINT CK_Bitacoras_sem CHECK (ISJSON(semaforos) = 1),
  CONSTRAINT UX_Bitacoras_user_week UNIQUE (user_id, week)
);
GO

IF OBJECT_ID('dbo.Materials', 'U') IS NULL
CREATE TABLE dbo.Materials (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  title           NVARCHAR(200) NOT NULL,
  type            NVARCHAR(10)  NOT NULL,      -- free | premium | fisico
  kind            NVARCHAR(20)  NULL,          -- video, podcast, kit, tienda...
  motivation_text NVARCHAR(500) NULL,          -- obligatorio para descargar (se valida en API, Fase 4)
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  url             NVARCHAR(400) NULL,
  created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Materials_type CHECK (type IN ('free', 'premium', 'fisico'))
);
GO

IF OBJECT_ID('dbo.Community', 'U') IS NULL
CREATE TABLE dbo.Community (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES dbo.Users(id) ON DELETE CASCADE,
  post_type   NVARCHAR(10) NOT NULL,           -- dibujo | audio | texto
  content_url NVARCHAR(300) NULL,
  [text]      NVARCHAR(1000) NULL,
  created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Community_type CHECK (post_type IN ('dibujo', 'audio', 'texto'))
);
GO

IF OBJECT_ID('dbo.AnchorPhrases', 'U') IS NULL
CREATE TABLE dbo.AnchorPhrases (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  text       NVARCHAR(400) NOT NULL,
  sort_order INT NOT NULL,
  active     BIT NOT NULL DEFAULT 1
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.AnchorPhrases)
INSERT INTO dbo.AnchorPhrases (text, sort_order) VALUES
 (N'No se trata de que eso que te distrae ahora, ya no lo hagas nunca, se trata de ser consciente en cómo usas tu tiempo', 1),
 (N'Recuerda que un objetivo son muchas subtareas con check in ✅', 2),
 (N'Tu propósito es el Horizonte de tu toma de decisiones', 3);
GO
