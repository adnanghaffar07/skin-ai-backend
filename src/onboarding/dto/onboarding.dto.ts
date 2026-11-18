import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class QuestionnaireOptionDto {
  @ApiProperty({ example: 'age_25_34' })
  code!: string;

  @ApiProperty({ example: '25-34' })
  label!: string;

  @ApiProperty({ example: 3 })
  position!: number;
}

export class QuestionnaireQuestionDto {
  @ApiProperty({ example: 'age_range' })
  key!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: 'What is your age range?' })
  prompt!: string;

  @ApiProperty({
    type: String,
    example: 'Beautiful skin has no age. Let\'s find care for your stage of life.',
    nullable: true,
  })
  help_text!: string | null;

  @ApiProperty({ example: 'single' })
  selection_mode!: string;

  @ApiProperty({ example: true })
  required!: boolean;

  @ApiProperty({ type: Number, example: 1, nullable: true })
  min_selections!: number | null;

  @ApiProperty({ type: Number, example: 1, nullable: true })
  max_selections!: number | null;

  @ApiProperty({ type: [QuestionnaireOptionDto] })
  options!: QuestionnaireOptionDto[];
}

export class ActiveQuestionnaireDto {
  @ApiProperty({ example: '1b2c3d4e-5f60-4781-9abc-def012345678' })
  id!: string;

  @ApiProperty({ example: 'onboarding' })
  key!: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: 'en' })
  locale!: string;

  @ApiProperty({ example: 'Onboarding' })
  title!: string;

  @ApiProperty({ type: [QuestionnaireQuestionDto] })
  questions!: QuestionnaireQuestionDto[];
}

export class CreateSessionDto {}

export class SessionCreatedDto {
  @ApiProperty({ example: 'aa11bb22-cc33-4dd4-8ee5-ff6677889900' })
  onboarding_session_id!: string;

  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  submission_id!: string;

  @ApiProperty({ example: 1 })
  questionnaire_version!: number;

  @ApiProperty({ example: 'draft' })
  status!: string;

  @ApiPropertyOptional({
    example: 'opaque-claim-token',
    description: 'Returned once, and only when the caller is anonymous.',
  })
  claim_token?: string;
}

export class ClaimSessionDto {
  @ApiProperty({ example: 'opaque-claim-token' })
  @IsString()
  @MaxLength(200)
  claim_token!: string;
}

export class ClaimSessionResponseDto {
  @ApiProperty({ example: 'aa11bb22-cc33-4dd4-8ee5-ff6677889900' })
  onboarding_session_id!: string;

  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  submission_id!: string;

  @ApiProperty({ example: 'draft' })
  status!: string;
}

export class UpsertAnswersDto {
  @ApiProperty({ example: 'product_interests' })
  @IsString()
  @MaxLength(64)
  question_key!: string;

  @ApiProperty({ type: [String], example: ['serums', 'sunscreens'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  option_codes!: string[];
}

export class AnswerProgressDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  submission_id!: string;

  @ApiProperty({ example: 'draft' })
  status!: string;

  @ApiProperty({ type: [String], example: ['age_range'] })
  answered_question_keys!: string[];

  @ApiProperty({ type: [String], example: ['skin_type', 'skin_concerns'] })
  required_remaining!: string[];
}

export class SubmissionAnswerDto {
  @ApiProperty({ example: 'age_range' })
  question_key!: string;

  @ApiProperty({ type: [String], example: ['age_25_34'] })
  option_codes!: string[];
}

export class SubmissionDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  id!: string;

  @ApiProperty({ example: 'draft' })
  status!: string;

  @ApiProperty({ example: 1 })
  questionnaire_version!: number;

  @ApiProperty({ type: [SubmissionAnswerDto] })
  answers!: SubmissionAnswerDto[];
}

export class CompletedSubmissionDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  submission_id!: string;

  @ApiProperty({ example: 'completed' })
  status!: string;

  @ApiProperty({ example: 1 })
  questionnaire_version!: number;

  @ApiProperty({ type: [String], example: ['age_range'] })
  answered_question_keys!: string[];

  @ApiProperty({ type: String, example: 'continue_without_scan', nullable: true })
  face_scan_opt_in!: string | null;
}

export class FormAnswerDto {
  @ApiProperty({ example: 'age_range' })
  @IsString()
  @MaxLength(64)
  question_key!: string;

  @ApiProperty({ type: [String], example: ['age_25_34'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  option_codes!: string[];

  @ApiPropertyOptional({
    type: String,
    example: 'Retinol serum',
    nullable: true,
    maxLength: 500,
    description:
      'Optional follow-up for reaction_history when the answer is knows_ingredient or unknown_cause.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text_value?: string | null;
}

export class SubmitOnboardingFormDto {
  @ApiProperty({
    type: [FormAnswerDto],
    example: [
      { question_key: 'age_range', option_codes: ['age_25_34'] },
      { question_key: 'skin_type', option_codes: ['combination'] },
      {
        question_key: 'skin_concerns',
        option_codes: ['dryness_dehydration', 'uneven_texture'],
      },
      { question_key: 'sensitivity_level', option_codes: ['sometimes_sensitive'] },
      { question_key: 'primary_goal', option_codes: ['improve_hydration'] },
      { question_key: 'current_routine', option_codes: ['cleanser_moisturizer'] },
      { question_key: 'reaction_history', option_codes: ['no_known_reactions'] },
      { question_key: 'monthly_budget', option_codes: ['20_50'] },
      { question_key: 'product_interests', option_codes: ['serums', 'sunscreens'] },
      { question_key: 'face_scan_opt_in', option_codes: ['continue_without_scan'] },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FormAnswerDto)
  answers!: FormAnswerDto[];
}

export class OnboardingFormResponseDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  submission_id!: string;

  @ApiProperty({ example: 'completed' })
  status!: 'completed';

  @ApiProperty({ example: 1 })
  questionnaire_version!: number;

  @ApiProperty({ type: [FormAnswerDto] })
  answers!: FormAnswerDto[];

  @ApiProperty({ type: String, example: 'continue_without_scan', nullable: true })
  face_scan_opt_in!: string | null;
}
