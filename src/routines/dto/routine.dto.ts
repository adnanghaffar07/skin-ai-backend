import { ApiProperty } from '@nestjs/swagger';

export class RoutineStepDto {
  @ApiProperty() step_id!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ example: 'cleanse' }) step_type!: string;
  @ApiProperty({ example: 'Cleanse' }) title!: string;
  @ApiProperty({ type: String, nullable: true }) product_id!: string | null;
  @ApiProperty({ type: String, nullable: true }) product_name!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '1 min' }) duration_label!: string | null;
  @ApiProperty({ type: String, nullable: true }) amount_label!: string | null;
  @ApiProperty({ type: String, nullable: true }) instruction!: string | null;
  @ApiProperty() completed!: boolean;
}

export class RoutineDto {
  @ApiProperty({ type: String, nullable: true }) routine_id!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '2026-11-11' }) routine_date!: string | null;
  @ApiProperty() completed_count!: number;
  @ApiProperty() step_count!: number;
  @ApiProperty({ type: [RoutineStepDto] }) morning!: RoutineStepDto[];
  @ApiProperty({ type: [RoutineStepDto] }) evening!: RoutineStepDto[];
}

export class StepCompletionDto {
  @ApiProperty() step_id!: string;
  @ApiProperty() completed_count!: number;
  @ApiProperty() step_count!: number;
}
