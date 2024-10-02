use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, TokenAccount, Transfer as SplTransfer},
};

use spl_associated_token_account::{get_associated_token_address, instruction as Splinstruction};
use std::str::FromStr;

declare_id!("4AbKnJAgoDzwULHEiaLXZeR6kgr2JwqngG78HFa38bkg");

#[program]
pub mod escrow {
    use super::*;

    // init escrow account
    pub fn init_escrow(ctx: Context<InitEscrow>, amount: u64, mint_address: Pubkey) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.amount = amount; // amount
        escrow.mint_address = mint_address; // public key of mint
        escrow.escrow_owner = ctx.accounts.signer.key(); // user initiating escrow

        Ok(())
    }

    pub fn create_ata(ctx: Context<CreateATA>) -> Result<()> {
        let wallet_owner = &ctx.accounts.escrow;
        let token_mint_address = &ctx.accounts.escrow.mint_address;
        let signer = &ctx.accounts.signer;
        let token_program = &ctx.accounts.token_program;
        let system_program = &ctx.accounts.system_program;
        let associate_token_program = &ctx.accounts.associated_token_program;
        let escrow_ata = &ctx.accounts.escrow_ata;
        let ata_key = get_associated_token_address(&wallet_owner.key(), &token_mint_address.key());

        require_eq!(ata_key, escrow_ata.key());

        if escrow_ata.get_lamports() == 0 {
            msg!("Creating associated token account for escrow!");
            anchor_lang::solana_program::program::invoke(
                &Splinstruction::create_associated_token_account(
                    &signer.key(),
                    &wallet_owner.key(),
                    &token_mint_address.key(),
                    &token_program.key(),
                ),
                &[signer.to_account_info().clone()],
            )?;
        } else {
            msg!("Associated token account exists!")
        }
        msg!("ATA created!");
        Ok(())
    }

    pub fn transfer_token(ctx: Context<TransferToken>) -> Result<()> {
        let source = &ctx.accounts.from_ata;
        let destination = &ctx.accounts.to_ata;
        let authority = &ctx.accounts.from;
        let token_program = &ctx.accounts.token_program;
        let amount = &ctx.accounts.escrow.amount;

        let cpi_accounts = SplTransfer {
            from: source.to_account_info().clone(),
            to: destination.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };

        let cpi_program = token_program.to_account_info();

        token::transfer(CpiContext::new(cpi_program, cpi_accounts), *amount)?;

        msg!("Token transferred!");
        Ok(())
    }

}

#[derive(Accounts)]
pub struct InitEscrow<'info> {
    #[account(
        init,
        space = 8 + 8 + 32 + 32,
        seeds=[b"escrow", signer.key().as_ref()],
        bump,
        payer = signer
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Escrow {
    pub amount: u64,
    pub mint_address: Pubkey,
    pub escrow_owner: Pubkey,
}

#[derive(Accounts)]
pub struct CreateATA<'info> {
    #[account(
        seeds=[b"escrow", signer.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init_if_needed,
        payer = signer,
        seeds = [
            escrow.key().as_ref(),
            token_program.key().as_ref(), 
            escrow.mint_address.key().as_ref()
        ],
        bump,
        space = 8 + 8
    )]
    pub escrow_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)] // to create an associated token account, we need:
pub struct TransferToken<'info> {
    #[account(
        seeds=[b"escrow", from.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init_if_needed,
        payer = from,
        seeds = [
            escrow.key().as_ref(),
            token_program.key().as_ref(), 
            escrow.mint_address.key().as_ref()
        ],
        bump,
        space = 8 + 8
    )]
    pub to_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub from: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}
