import { IsEmail, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateDealDto {
  @IsUUID()
  contactId: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class UpdateDealDto {
  @IsOptional()
  @IsString()
  stage?: string;
}
