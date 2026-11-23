import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import { MediaStorage } from '../storage/object-storage.js';
import { AVATAR_LINK_SECONDS, AVATAR_MAX_BYTES, AVATAR_TYPES } from '../users/avatar.service.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';

// ---------- Dermatologists ----------

export class DermatologistDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Dr. Maya Shah' }) name!: string;
  @ApiProperty() speciality!: string;
  @ApiProperty() focus!: string;
  @ApiProperty() about!: string;
  @ApiProperty({ type: [String] }) languages!: string[];
  @ApiProperty({ type: Number, nullable: true }) rating!: number | null;
  @ApiProperty() review_count!: number;
  @ApiProperty({ example: '20.00' }) fee!: string;
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ type: String, nullable: true }) photo_url!: string | null;
  @ApiProperty() video!: boolean;
  @ApiProperty() call!: boolean;
  @ApiProperty({ type: [String], example: ['10:30 AM', '12:00 PM'] }) slot_times!: string[];
}

type DoctorRow = Omit<DermatologistDto, 'fee' | 'rating'> & { rating: string | null; fee_cents: number };

const presentDoctor = (row: DoctorRow): DermatologistDto => ({
  id: row.id,
  name: row.name,
  speciality: row.speciality,
  focus: row.focus,
  about: row.about,
  languages: row.languages ?? [],
  rating: row.rating === null ? null : Number(row.rating),
  review_count: row.review_count,
  fee: (row.fee_cents / 100).toFixed(2),
  currency: row.currency.trim(),
  photo_url: row.photo_url,
  video: row.video,
  call: row.call,
  slot_times: row.slot_times ?? [],
});

const DOCTOR_COLUMNS = 'id, name, speciality, focus, about, languages, rating::text as rating, review_count, fee_cents, currency, photo_url, video, call, slot_times';

@Injectable()
export class DermatologistsService {
  constructor(private readonly database: DatabaseService) {}

  async list(mode?: string): Promise<DermatologistDto[]> {
    const filter = mode === 'video' ? 'and video' : mode === 'call' ? 'and call' : '';
    const rows = await this.database.query<DoctorRow>(
      `select ${DOCTOR_COLUMNS} from public.dermatologists where active ${filter} order by sort_order, name`,
    );
    return rows.map(presentDoctor);
  }

  async get(id: string): Promise<DermatologistDto> {
    const rows = await this.database.query<DoctorRow>(`select ${DOCTOR_COLUMNS} from public.dermatologists where id = $1 and active`, [id]);
    if (!rows.length) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Dermatologist not found.');
    }
    return presentDoctor(rows[0]);
  }
}

@ApiTags('Dermatologists')
@Controller('dermatologists')
export class DermatologistsController {
  constructor(private readonly doctors: DermatologistsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Dermatologists to show on Find a dermatologist', description: 'Booking a visit is not live yet.' })
  @ApiQuery({ name: 'mode', required: false, enum: ['video', 'call'] })
  @ApiOkResponse({ type: [DermatologistDto] })
  list(@Query('mode') mode?: string): Promise<DermatologistDto[]> {
    return this.doctors.list(mode);
  }

  @Public()
  @Get(':id')
  @ApiOkResponse({ type: DermatologistDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<DermatologistDto> {
    return this.doctors.get(id);
  }
}

// ---------- Consultation notes ----------

const NOTE_PHOTO = /^users\/[0-9a-f-]{36}\/consultation-\d+\.(jpg|png|webp)$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class NoteDto {
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsUUID() dermatologist_id?: string | null;
  @ApiProperty({ example: 'Dr. Maya Shah' }) @IsString() @MinLength(1) @MaxLength(120) doctor_name!: string;
  @ApiProperty({ example: '2026-10-16' }) @Matches(DAY) visited_on!: string;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() @MaxLength(120) title?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiProperty({ required: false, nullable: true, description: 'From POST /me/consultations/photo-upload-url; null removes the photo.' })
  @IsOptional()
  @Matches(NOTE_PHOTO)
  photo_object_key?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'A photo of the doctor, uploaded the same way; null removes it.' })
  @IsOptional()
  @Matches(NOTE_PHOTO)
  doctor_photo_object_key?: string | null;
}

export class NoteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) dermatologist_id!: string | null;
  @ApiProperty() doctor_name!: string;
  @ApiProperty() visited_on!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty() notes!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Signed link; stops working after an hour.' }) photo_url!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The doctor\'s photo, when the note is linked to a doctor.' }) doctor_photo_url!: string | null;
}

export class NotePhotoUploadDto {
  @ApiProperty({ enum: Object.keys(AVATAR_TYPES) }) @IsIn(Object.keys(AVATAR_TYPES)) content_type!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(AVATAR_MAX_BYTES) byte_size!: number;
}

type NoteRow = { id: string; dermatologist_id: string | null; doctor_name: string; visited_on: string; title: string | null; notes: string; photo_object_key: string | null; doctor_photo_object_key: string | null; doctor_photo_url: string | null };

@Injectable()
export class ConsultationNotesService {
  constructor(
    private readonly users: UsersService,
    private readonly database: DatabaseService,
    private readonly media: MediaStorage,
  ) {}

  private async present(row: NoteRow): Promise<NoteResponseDto> {
    const sign = (key: string | null) => (key ? this.media.createSignedDownload(key, AVATAR_LINK_SECONDS).catch(() => null) : Promise.resolve(null));
    const [photo, ownDoctorPhoto] = await Promise.all([sign(row.photo_object_key), sign(row.doctor_photo_object_key)]);
    return {
      id: row.id,
      dermatologist_id: row.dermatologist_id,
      doctor_name: row.doctor_name,
      visited_on: row.visited_on,
      title: row.title,
      notes: row.notes,
      photo_url: photo,
      doctor_photo_url: ownDoctorPhoto ?? row.doctor_photo_url,
    };
  }

  private rows(userId: string, id?: string) {
    return this.database.query<NoteRow>(
      `select n.id, n.dermatologist_id, n.doctor_name, n.visited_on::text as visited_on, n.title, n.notes, n.photo_object_key, n.doctor_photo_object_key, d.photo_url as doctor_photo_url
       from public.consultation_notes n left join public.dermatologists d on d.id = n.dermatologist_id
       where n.user_id = $1 ${id ? 'and n.id = $2' : ''}
       order by n.visited_on desc, n.created_at desc`,
      id ? [userId, id] : [userId],
    );
  }

  async list(user: AuthenticatedUser): Promise<NoteResponseDto[]> {
    await this.users.getMe(user);
    return Promise.all((await this.rows(user.id)).map(row => this.present(row)));
  }

  async photoUploadUrl(user: AuthenticatedUser, contentType: string, byteSize: number) {
    await this.users.getMe(user);
    const key = `users/${user.id}/consultation-${Date.now()}.${AVATAR_TYPES[contentType]}`;
    return { ...(await this.media.createSignedUpload({ key, contentType, byteSize, expiresInSeconds: 600 })), object_key: key };
  }

  private async checkPhoto(user: AuthenticatedUser, key: string | null | undefined): Promise<void> {
    if (!key) {
      return;
    }
    if (!key.startsWith(`users/${user.id}/`)) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'That photo does not belong to this account.');
    }
    const head = await this.media.head(key);
    if (!head) {
      throw new ApiException(409, ErrorCode.CONFLICT, 'The photo has not been uploaded yet.');
    }
    if (!AVATAR_TYPES[head.contentType] || head.byteSize > AVATAR_MAX_BYTES) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Use a JPEG, PNG or WebP photo of 5 MB or smaller.');
    }
  }

  async create(user: AuthenticatedUser, body: NoteDto): Promise<NoteResponseDto> {
    await this.users.getMe(user);
    await this.checkPhoto(user, body.photo_object_key);
    await this.checkPhoto(user, body.doctor_photo_object_key);
    const rows = await this.database.query<{ id: string }>(
      `insert into public.consultation_notes (user_id, dermatologist_id, doctor_name, visited_on, title, notes, photo_object_key, doctor_photo_object_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [user.id, body.dermatologist_id ?? null, body.doctor_name.trim(), body.visited_on, body.title?.trim() || null, body.notes?.trim() ?? '', body.photo_object_key ?? null, body.doctor_photo_object_key ?? null],
    );
    return this.present((await this.rows(user.id, rows[0].id))[0]);
  }

  async update(user: AuthenticatedUser, id: string, body: NoteDto): Promise<NoteResponseDto> {
    const current = (await this.rows(user.id, id))[0];
    if (!current) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Note not found.');
    }
    const photo = body.photo_object_key === undefined ? current.photo_object_key : body.photo_object_key;
    const doctorPhoto = body.doctor_photo_object_key === undefined ? current.doctor_photo_object_key : body.doctor_photo_object_key;
    if (photo !== current.photo_object_key) {
      await this.checkPhoto(user, photo);
    }
    if (doctorPhoto !== current.doctor_photo_object_key) {
      await this.checkPhoto(user, doctorPhoto);
    }
    await this.database.query(
      `update public.consultation_notes set dermatologist_id = $3, doctor_name = $4, visited_on = $5, title = $6, notes = $7, photo_object_key = $8,
         doctor_photo_object_key = $9, updated_at = now()
       where id = $2 and user_id = $1`,
      [user.id, id, body.dermatologist_id ?? null, body.doctor_name.trim(), body.visited_on, body.title?.trim() || null, body.notes?.trim() ?? '', photo, doctorPhoto],
    );
    for (const [old, now] of [[current.photo_object_key, photo], [current.doctor_photo_object_key, doctorPhoto]]) {
      if (old && old !== now) {
        await this.media.delete(old).catch(() => undefined);
      }
    }
    return this.present((await this.rows(user.id, id))[0]);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const current = (await this.rows(user.id, id))[0];
    if (!current) {
      return;
    }
    for (const key of [current.photo_object_key, current.doctor_photo_object_key]) {
      if (key) {
        await this.media.delete(key);
      }
    }
    await this.database.query('delete from public.consultation_notes where id = $2 and user_id = $1', [user.id, id]);
  }
}

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me/consultations')
export class ConsultationNotesController {
  constructor(private readonly notes: ConsultationNotesService) {}

  @Get()
  @ApiOperation({ summary: 'My consultation notes, newest visit first' })
  @ApiOkResponse({ type: [NoteResponseDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<NoteResponseDto[]> {
    return this.notes.list(user);
  }

  @Post('photo-upload-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get a link to upload a photo for a note', description: 'PUT the photo there, then send `object_key` as photo_object_key.' })
  photoUploadUrl(@CurrentUser() user: AuthenticatedUser, @Body() body: NotePhotoUploadDto) {
    return this.notes.photoUploadUrl(user, body.content_type, body.byte_size);
  }

  @Post()
  @ApiOkResponse({ type: NoteResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: NoteDto): Promise<NoteResponseDto> {
    return this.notes.create(user, body);
  }

  @Put(':id')
  @ApiOkResponse({ type: NoteResponseDto })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: NoteDto): Promise<NoteResponseDto> {
    return this.notes.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.notes.remove(user, id);
  }
}

@Module({
  imports: [UsersModule],
  controllers: [DermatologistsController, ConsultationNotesController],
  providers: [DermatologistsService, ConsultationNotesService],
})
export class CareModule {}
