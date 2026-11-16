import { ApiProperty } from '@nestjs/swagger';
import { RoutineStepDto } from '../../routines/dto/routine.dto.js';

export class HomeRoutineDto {
  @ApiProperty() completed_count!: number;
  @ApiProperty() step_count!: number;
  @ApiProperty({ type: [RoutineStepDto] }) steps!: RoutineStepDto[];
}

export class ScoreEntryDto {
  @ApiProperty({ example: '2026-11-11' }) captured_on!: string;
  @ApiProperty({ type: Number, nullable: true }) overall_score!: number | null;
}

export class HomeDto {
  @ApiProperty({ type: String, nullable: true, example: 'Amelia' }) greeting_name!: string | null;
  @ApiProperty({ type: Object, nullable: true, example: null }) latest_scan!: null;
  @ApiProperty({ type: Object, nullable: true, example: null }) focus!: null;
  @ApiProperty({ type: HomeRoutineDto }) morning_routine!: HomeRoutineDto;
  @ApiProperty({ type: [String], example: [] }) week!: string[];
  @ApiProperty({ type: [ScoreEntryDto] }) recent_scores!: ScoreEntryDto[];
}

export class ProgressDto {
  @ApiProperty({ type: String, nullable: true, example: '2026-11-18' }) next_scan_on!: string | null;
  @ApiProperty({ type: ScoreEntryDto, nullable: true }) latest!: ScoreEntryDto | null;
  @ApiProperty({ type: ScoreEntryDto, nullable: true }) previous!: ScoreEntryDto | null;
  @ApiProperty({ type: Number, nullable: true }) overall_score!: number | null;
  @ApiProperty({ type: [String], example: [] }) changes!: string[];
}

export class SkinReportDto {
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty() morning_step_count!: number;
  @ApiProperty() evening_step_count!: number;
  @ApiProperty({ type: Object, nullable: true, example: null }) hydration!: null;
  @ApiProperty({ type: Object, nullable: true, example: null }) redness!: null;
  @ApiProperty({ type: Object, nullable: true, example: null }) uneven_tone!: null;
}
