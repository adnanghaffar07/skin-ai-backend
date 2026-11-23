import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class AvatarUploadDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'], example: 'image/jpeg' })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  content_type!: string;

  @ApiProperty({ example: 182044, description: 'Bytes; at most 5 MB.' })
  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  byte_size!: number;
}

export class AvatarUploadLinkDto {
  @ApiProperty() upload_url!: string;
  @ApiProperty({ example: 'PUT' }) method!: 'PUT';
  @ApiProperty({ type: Object }) headers!: Record<string, string>;
  @ApiProperty() expires_at!: string;
  @ApiProperty({ example: 'users/0b6c…/avatar-1795461200000.jpg' }) object_key!: string;
}

export class ConfirmAvatarDto {
  @ApiProperty({ example: 'users/0b6c…/avatar-1795461200000.jpg' })
  @IsString()
  @MaxLength(200)
  @Matches(/^users\/[0-9a-f-]{36}\/avatar-\d+\.(jpg|png|webp)$/)
  object_key!: string;
}

export class AvatarDto {
  @ApiProperty({ description: 'Signed link to the photo; it stops working after an hour.' })
  avatar_url!: string;
}
